const AMFI_URL =
  'https://portal.amfiindia.com/spages/NAVAll.txt';

let masterCache = {
  expiresAt: 0,
  records: []
};

let navCache = {
  expiresAt: 0,
  byIsin: {}
};

module.exports = async function handler(
  request,
  response
) {
  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      message: 'Only POST requests are allowed.'
    });
  }

  try {
    const body = parseBody_(request.body);

    const holdings =
      normalizeInputHoldings_(
        body.holdings
      );

    const pos =
      money_(body.pos) || 0;

    const overdueCharges =
      money_(body.overdueCharges) || 0;

    if (!holdings.length) {
      return response.status(400).json({
        success: false,
        message:
          'At least one valid holding is required.'
      });
    }

    if (pos < 0 || overdueCharges < 0) {
      return response.status(400).json({
        success: false,
        message:
          'POS and overdue charges cannot be negative.'
      });
    }

    const [
      masterRecords,
      latestNavByIsin
    ] = await Promise.all([
      getMasterRecords_(),
      getLatestNavIndex_()
    ]);

    const masterIndex =
      buildMasterIndex_(masterRecords);

    const matchedHoldings =
      holdings.map(function (holding) {
        return {
          holding,
          match: matchMaster_(
            holding,
            masterIndex
          )
        };
      });

    const funds =
      await mapWithConcurrency_(
        matchedHoldings,
        5,
        async function (item) {
          return calculateFund_(
            item.holding,
            item.match,
            latestNavByIsin
          );
        }
      );

    const totals = funds.reduce(
      function (summary, fund) {
        if (!fund.includedInTotals) {
          return summary;
        }

        summary.previousMarketValue +=
          fund.previousMarketValue || 0;

        summary.currentMarketValue +=
          fund.currentMarketValue || 0;

        summary.grossDrawingPower +=
          fund.grossDrawingPower || 0;

        summary.riskDrawingPower +=
          fund.riskDrawingPower || 0;

        summary.portfolioValueChange +=
          fund.valueChange || 0;

        return summary;
      },
      {
        previousMarketValue: 0,
        currentMarketValue: 0,
        grossDrawingPower: 0,
        riskDrawingPower: 0,
        portfolioValueChange: 0
      }
    );

    const exposure =
      pos + overdueCharges;

    const grossShortfall =
      Math.max(
        0,
        exposure -
        totals.grossDrawingPower
      );

    const riskShortfall =
      Math.max(
        0,
        exposure -
        totals.riskDrawingPower
      );

    const availableLimit =
      Math.max(
        0,
        totals.grossDrawingPower -
        exposure
      );

    let accountStatus;

    if (
      exposure <=
      totals.grossDrawingPower
    ) {
      accountStatus =
        'NO SHORTFALL';

    } else if (
      exposure <=
      totals.riskDrawingPower
    ) {
      accountStatus =
        'PORTFOLIO SHORTFALL WARNING';

    } else {
      accountStatus =
        'REGULATORY SHORTFALL';
    }

    const warnings = funds
      .filter(function (fund) {
        return !fund.includedInTotals;
      })
      .map(function (fund) {
        return (
          fund.scripName +
          ': ' +
          fund.calculationStatus
        );
      });

    return response.status(200).json({
      success: true,

      accountSummary: {
        totalPreviousMarketValue:
          roundMoney_(
            totals.previousMarketValue
          ),

        totalCurrentMarketValue:
          roundMoney_(
            totals.currentMarketValue
          ),

        totalPortfolioValueChange:
          roundMoney_(
            totals.portfolioValueChange
          ),

        totalGrossDrawingPower:
          roundMoney_(
            totals.grossDrawingPower
          ),

        totalRiskDrawingPower:
          roundMoney_(
            totals.riskDrawingPower
          ),

        pos:
          roundMoney_(pos),

        overdueCharges:
          roundMoney_(overdueCharges),

        exposure:
          roundMoney_(exposure),

        grossShortfall:
          roundMoney_(grossShortfall),

        riskShortfall:
          roundMoney_(riskShortfall),

        availableLimit:
          roundMoney_(availableLimit),

        accountStatus
      },

      funds,
      warnings,

      calculatedAt:
        new Date().toISOString()
    });

  } catch (error) {
    console.error(
      'Portfolio calculation error:',
      error
    );

    return response.status(500).json({
      success: false,
      message:
        'Unable to calculate the portfolio.',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined
    });
  }
};

async function calculateFund_(
  holding,
  match,
  latestNavByIsin
) {
  const master = match.record;

  const base = {
    number: holding.number,
    assetClass: holding.assetClass,
    scripName: holding.scripName,

    isin: master
      ? master.isin
      : holding.isin,

    amcName: master
      ? master.amcName
      : '',

    schemeType: master
      ? master.schemeType
      : '',

    scripCategory:
      holding.scripCategory,

    units: holding.units,

    statementMarketValue:
      holding.statementMarketValue,

    statementLtv:
      holding.statementLtv,

    statementGrossDrawingPower:
      holding.statementGrossDrawingPower,

    internalLtv: master
      ? master.internalLtv
      : null,

    riskLtv: master
      ? master.riskLtv
      : null,

    masterMatchStatus:
      match.status,

    masterMatchConfidence:
      match.confidence,

    includedInTotals: false
  };

  if (!master) {
    return Object.assign(base, {
      calculationStatus:
        match.status
    });
  }

  if (
    master.internalLtv === null ||
    master.riskLtv === null
  ) {
    return Object.assign(base, {
      calculationStatus:
        'LTV NOT CONFIGURED'
    });
  }

  const current =
    latestNavByIsin[master.isin];

  if (!current) {
    return Object.assign(base, {
      calculationStatus:
        'CURRENT NAV NOT FOUND'
    });
  }

  const previous =
    await getPreviousNav_(
      current.schemeCode,
      current.date
    );

  const currentMarketValue =
    holding.units * current.nav;

  const previousMarketValue =
    previous
      ? holding.units * previous.nav
      : null;

  const grossDrawingPower =
    currentMarketValue *
    master.internalLtv;

  const riskDrawingPower =
    currentMarketValue *
    master.riskLtv;

  const navChange =
    previous
      ? current.nav - previous.nav
      : null;

  const navChangePercent =
    previous &&
    previous.nav !== 0
      ? (
          navChange /
          previous.nav
        ) * 100
      : null;

  const valueChange =
    previousMarketValue === null
      ? null
      : currentMarketValue -
        previousMarketValue;

  let movementStatus =
    'NOT AVAILABLE';

  if (navChange !== null) {
    movementStatus =
      navChange > 0
        ? 'UP'
        : navChange < 0
          ? 'DOWN'
          : 'NO CHANGE';
  }

  return Object.assign(base, {
    schemeCode:
      current.schemeCode,

    currentNav:
      roundNav_(current.nav),

    currentNavDate:
      current.date,

    previousNav:
      previous
        ? roundNav_(previous.nav)
        : null,

    previousNavDate:
      previous
        ? previous.date
        : null,

    previousMarketValue:
      previousMarketValue === null
        ? null
        : roundMoney_(
            previousMarketValue
          ),

    currentMarketValue:
      roundMoney_(
        currentMarketValue
      ),

    grossDrawingPower:
      roundMoney_(
        grossDrawingPower
      ),

    riskDrawingPower:
      roundMoney_(
        riskDrawingPower
      ),

    navChange:
      navChange === null
        ? null
        : roundNav_(navChange),

    navChangePercent:
      navChangePercent === null
        ? null
        : roundPercent_(
            navChangePercent
          ),

    valueChange:
      valueChange === null
        ? null
        : roundMoney_(
            valueChange
          ),

    movementStatus,

    calculationStatus:
      previous
        ? 'CALCULATED'
        : 'CALCULATED; PREVIOUS NAV UNAVAILABLE',

    includedInTotals: true
  });
}

async function getMasterRecords_() {
  if (
    masterCache.expiresAt >
    Date.now()
  ) {
    return masterCache.records;
  }

  const url =
    process.env.APPS_SCRIPT_API_URL;

  if (!url) {
    throw new Error(
      'APPS_SCRIPT_API_URL is not configured in Vercel.'
    );
  }

  const result = await fetch(
    url,
    {
      method: 'GET',
      redirect: 'follow',

      headers: {
        Accept: 'application/json'
      }
    }
  );

  if (!result.ok) {
    throw new Error(
      'Apps Script returned HTTP ' +
      result.status
    );
  }

  const json =
    await result.json();

  if (
    !json.success ||
    !Array.isArray(json.data)
  ) {
    throw new Error(
      json.message ||
      'Invalid master Sheet response.'
    );
  }

  masterCache = {
    expiresAt:
      Date.now() +
      5 * 60 * 1000,

    records: json.data
  };

  return masterCache.records;
}

function buildMasterIndex_(sourceRows) {
  const byIsin = {};
  const byName = {};
  const records = [];

  sourceRows.forEach(function (row) {
    const record = {
      isin: cleanIsin_(
        readField_(
          row,
          ['isin', 'isin code']
        )
      ),

      schemeName: text_(
        readField_(
          row,
          [
            'scheme name',
            'scrip name',
            'fund name'
          ]
        )
      ),

      amcName: text_(
        readField_(
          row,
          ['amc name', 'amc']
        )
      ),

      schemeType: text_(
        readField_(
          row,
          [
            'scheme type',
            'asset class'
          ]
        )
      ),

      internalLtv: ltv_(
        readField_(
          row,
          ['internal ltv', 'ltv']
        )
      ),

      riskLtv: ltv_(
        readField_(
          row,
          [
            'risk ltv',
            'buffer ltv',
            'risk buffer ltv'
          ]
        )
      )
    };

    if (
      !record.isin ||
      !record.schemeName
    ) {
      return;
    }

    record.nameKey =
      normalizeName_(
        record.schemeName
      );

    record.tokens =
      tokenSet_(record.nameKey);

    byIsin[record.isin] =
      record;

    if (!byName[record.nameKey]) {
      byName[record.nameKey] = [];
    }

    byName[record.nameKey].push(
      record
    );

    records.push(record);
  });

  return {
    byIsin,
    byName,
    records
  };
}

function matchMaster_(
  holding,
  index
) {
  if (
    holding.isin &&
    index.byIsin[holding.isin]
  ) {
    return {
      record:
        index.byIsin[holding.isin],

      status:
        'MATCHED BY ISIN',

      confidence: 1
    };
  }

  const nameKey =
    normalizeName_(
      holding.scripName
    );

  const exact =
    index.byName[nameKey] || [];

  if (exact.length === 1) {
    return {
      record: exact[0],
      status:
        'MATCHED BY SCHEME NAME',
      confidence: 1
    };
  }

  if (exact.length > 1) {
    return {
      record: null,
      status:
        'REVIEW REQUIRED: DUPLICATE SCHEME NAME',
      confidence: null
    };
  }

  const inputTokens =
    tokenSet_(nameKey);

  const candidates =
    index.records
      .map(function (record) {
        return {
          record,

          score: similarity_(
            inputTokens,
            record.tokens
          )
        };
      })
      .filter(function (candidate) {
        return (
          compatiblePlan_(
            nameKey,
            candidate.record.nameKey
          ) &&
          candidate.score >= 0.72
        );
      })
      .sort(function (first, second) {
        return (
          second.score -
          first.score
        );
      });

  const best = candidates[0];
  const second = candidates[1];

  if (
    best &&
    best.score >= 0.88 &&
    (
      !second ||
      best.score - second.score >= 0.08
    )
  ) {
    return {
      record: best.record,

      status:
        'MATCHED BY NORMALIZED SCHEME NAME',

      confidence:
        roundPercent_(
          best.score * 100
        )
    };
  }

  return {
    record: null,

    status: best
      ? 'REVIEW REQUIRED: POSSIBLE SCHEME MATCH'
      : 'NOT FOUND IN MASTER',

    confidence: best
      ? roundPercent_(
          best.score * 100
        )
      : null
  };
}

async function getLatestNavIndex_() {
  if (
    navCache.expiresAt >
    Date.now()
  ) {
    return navCache.byIsin;
  }

  const result = await fetch(
    AMFI_URL,
    {
      headers: {
        Accept: 'text/plain'
      }
    }
  );

  if (!result.ok) {
    throw new Error(
      'AMFI returned HTTP ' +
      result.status
    );
  }

  const text =
    await result.text();

  const byIsin = {};

  text
    .split(/\r?\n/)
    .forEach(function (line) {
      const fields = line
        .split(';')
        .map(function (value) {
          return value.trim();
        });

      if (fields.length < 6) {
        return;
      }

      const record = {
        schemeCode: fields[0],
        schemeName: fields[3],
        nav: number_(fields[4]),
        date: fields[5]
      };

      if (
        !record.schemeCode ||
        record.nav === null ||
        !record.date
      ) {
        return;
      }

      [
        cleanIsin_(fields[1]),
        cleanIsin_(fields[2])
      ]
        .filter(Boolean)
        .forEach(function (isin) {
          byIsin[isin] = record;
        });
    });

  navCache = {
    expiresAt:
      Date.now() +
      30 * 60 * 1000,

    byIsin
  };

  return byIsin;
}

async function getPreviousNav_(
  schemeCode,
  currentDate
) {
  try {
    const result = await fetch(
      'https://api.mfapi.in/mf/' +
      encodeURIComponent(
        schemeCode
      ),
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!result.ok) {
      return null;
    }

    const json =
      await result.json();

    if (!Array.isArray(json.data)) {
      return null;
    }

    const currentTimestamp =
      dateValue_(currentDate);

    const history = json.data
      .map(function (row) {
        return {
          nav: number_(row.nav),
          date: row.date,
          timestamp:
            dateValue_(row.date)
        };
      })
      .filter(function (row) {
        return (
          row.nav !== null &&
          row.timestamp !== null &&
          (
            currentTimestamp === null ||
            row.timestamp <
            currentTimestamp
          )
        );
      })
      .sort(function (first, second) {
        return (
          second.timestamp -
          first.timestamp
        );
      });

    return history[0] || null;

  } catch (error) {
    console.error(
      'Previous NAV unavailable for ' +
      schemeCode,
      error
    );

    return null;
  }
}

function normalizeInputHoldings_(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map(function (row, index) {
      return {
        number:
          number_(row.number) ||
          index + 1,

        assetClass:
          text_(row.assetClass),

        scripName:
          text_(row.scripName),

        isin:
          cleanIsin_(row.isin),

        units:
          number_(row.units),

        statementMarketValue:
          money_(
            row.statementMarketValue
          ),

        statementLtv:
          ltv_(row.statementLtv),

        statementGrossDrawingPower:
          money_(
            row.statementGrossDrawingPower
          ),

        scripCategory:
          text_(row.scripCategory)
      };
    })
    .filter(function (row) {
      return (
        row.scripName &&
        row.units !== null &&
        row.units > 0
      );
    });
}

function readField_(row, aliases) {
  const keys =
    Object.keys(row);

  for (
    let index = 0;
    index < keys.length;
    index += 1
  ) {
    const normalized =
      normalizeHeader_(keys[index]);

    const matched =
      aliases.some(function (alias) {
        return (
          normalizeHeader_(alias) ===
          normalized
        );
      });

    if (matched) {
      return row[keys[index]];
    }
  }

  return null;
}

function normalizeHeader_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeName_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(
      /\(\s*g\s*\)/g,
      ' growth '
    )
    .replace(
      /\bsl\b/g,
      ' sun life '
    )
    .replace(
      /\bdividend\b/g,
      ' idcw '
    )
    .replace(
      /\breg\b/g,
      ' regular '
    )
    .replace(/&/g, ' and ')
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .replace(
      /\b(fund|option|plan|the|mutual)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet_(value) {
  return new Set(
    String(value || '')
      .split(' ')
      .filter(Boolean)
  );
}

function similarity_(
  first,
  second
) {
  if (
    !first.size ||
    !second.size
  ) {
    return 0;
  }

  let common = 0;

  first.forEach(function (token) {
    if (second.has(token)) {
      common += 1;
    }
  });

  return (
    common /
    Math.min(
      first.size,
      second.size
    )
  );
}

function compatiblePlan_(
  first,
  second
) {
  const flags = [
    'direct',
    'idcw',
    'growth'
  ];

  return flags.every(
    function (flag) {
      return (
        first.includes(flag) ===
        second.includes(flag)
      );
    }
  );
}

async function mapWithConcurrency_(
  items,
  limit,
  worker
) {
  const results =
    new Array(items.length);

  let next = 0;

  async function run() {
    while (true) {
      const index = next++;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await worker(
          items[index],
          index
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          limit,
          items.length
        )
      },
      run
    )
  );

  return results;
}

function parseBody_(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'object') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    return {};
  }
}

function text_(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanIsin_(value) {
  const cleaned =
    String(value || '')
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ''
      );

  return /^IN[A-Z0-9]{10}$/.test(
    cleaned
  )
    ? cleaned
    : '';
}

function number_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(
    String(value)
      .replace(
        /[,₹%\s]/g,
        ''
      )
      .replace(
        /^(.*)$/,
        '-$1'
      )
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function money_(value) {
  return number_(value);
}

function ltv_(value) {
  const parsed =
    number_(value);

  if (
    parsed === null ||
    parsed < 0
  ) {
    return null;
  }

  return parsed > 1
    ? parsed / 100
    : parsed;
}

function dateValue_(value) {
  const text =
    String(value || '').trim();

  let match = text.match(
    /^(\d{2})-(\d{2})-(\d{4})$/
  );

  if (match) {
    return Date.UTC(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );
  }

  match = text.match(
    /^(\d{2})-([A-Za-z]{3})-(\d{4})$/
  );

  if (!match) {
    return null;
  }

  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };

  const month =
    months[
      match[2].toLowerCase()
    ];

  if (month === undefined) {
    return null;
  }

  return Date.UTC(
    Number(match[3]),
    month,
    Number(match[1])
  );
}

function roundMoney_(value) {
  return Math.round(
    (
      value +
      Number.EPSILON
    ) * 100
  ) / 100;
}

function roundNav_(value) {
  return Math.round(
    (
      value +
      Number.EPSILON
    ) * 10000
  ) / 10000;
}

function roundPercent_(value) {
  return Math.round(
    (
      value +
      Number.EPSILON
    ) * 10000
  ) / 10000;
}
