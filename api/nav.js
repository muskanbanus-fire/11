const AMFI_LATEST_URL =
  'https://portal.amfiindia.com/spages/NAVAll.txt';

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      message: 'Only GET requests are allowed.'
    });
  }

  try {
    const isin = cleanIsin_(request.query.isin);

    if (!isin) {
      return response.status(400).json({
        success: false,
        message: 'A valid ISIN is required.'
      });
    }

    const latestResponse = await fetch(
      AMFI_LATEST_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'text/plain'
        }
      }
    );

    if (!latestResponse.ok) {
      throw new Error(
        'AMFI returned HTTP ' +
        latestResponse.status
      );
    }

    const latestText =
      await latestResponse.text();

    const currentRecord =
      findCurrentNav_(latestText, isin);

    if (!currentRecord) {
      return response.status(404).json({
        success: false,
        message:
          'NAV was not found for the supplied ISIN.',
        isin
      });
    }

    const previousRecord =
      await findPreviousNav_(
        currentRecord.schemeCode,
        currentRecord.date
      );

    const currentNav =
      currentRecord.nav;

    const previousNav =
      previousRecord
        ? previousRecord.nav
        : null;

    const navChange =
      previousNav !== null
        ? currentNav - previousNav
        : null;

    const navChangePercent =
      previousNav !== null &&
      previousNav !== 0
        ? (navChange / previousNav) * 100
        : null;

    let movementStatus = 'NOT AVAILABLE';

    if (navChange !== null) {
      if (navChange > 0) {
        movementStatus = 'UP';
      } else if (navChange < 0) {
        movementStatus = 'DOWN';
      } else {
        movementStatus = 'NO CHANGE';
      }
    }

    response.setHeader(
      'Cache-Control',
      's-maxage=1800, stale-while-revalidate=3600'
    );

    return response.status(200).json({
      success: true,
      isin,
      schemeCode:
        currentRecord.schemeCode,
      schemeName:
        currentRecord.schemeName,

      currentNav,
      currentNavDate:
        currentRecord.date,

      previousNav,
      previousNavDate:
        previousRecord
          ? previousRecord.date
          : null,

      navChange,
      navChangePercent,
      movementStatus,

      source: {
        current:
          'Association of Mutual Funds in India',
        previous:
          previousRecord
            ? 'MFAPI historical AMFI data'
            : null
      }
    });

  } catch (error) {
    console.error(
      'NAV API error:',
      error
    );

    return response.status(500).json({
      success: false,
      message:
        'Unable to fetch NAV information.',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

function findCurrentNav_(text, requestedIsin) {
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const fields = line
      .split(';')
      .map(function (value) {
        return value.trim();
      });

    if (fields.length < 6) {
      continue;
    }

    const schemeCode = fields[0];
    const firstIsin = cleanIsin_(fields[1]);
    const secondIsin = cleanIsin_(fields[2]);
    const schemeName = fields[3];
    const nav = parseNumber_(fields[4]);
    const date = fields[5];

    const isinMatched =
      firstIsin === requestedIsin ||
      secondIsin === requestedIsin;

    if (
      isinMatched &&
      schemeCode &&
      schemeName &&
      nav !== null &&
      date
    ) {
      return {
        schemeCode,
        schemeName,
        nav,
        date
      };
    }
  }

  return null;
}

async function findPreviousNav_(
  schemeCode,
  currentNavDate
) {
  try {
    const historyUrl =
      'https://api.mfapi.in/mf/' +
      encodeURIComponent(schemeCode);

    const historyResponse = await fetch(
      historyUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!historyResponse.ok) {
      return null;
    }

    const history =
      await historyResponse.json();

    if (
      !history ||
      !Array.isArray(history.data)
    ) {
      return null;
    }

    const currentTimestamp =
      parseDate_(currentNavDate);

    const historyRecords = history.data
      .map(function (record) {
        return {
          nav: parseNumber_(record.nav),
          date: record.date,
          timestamp:
            parseDate_(record.date)
        };
      })
      .filter(function (record) {
        return (
          record.nav !== null &&
          record.timestamp !== null
        );
      })
      .sort(function (first, second) {
        return (
          second.timestamp -
          first.timestamp
        );
      });

    const previous = historyRecords.find(
      function (record) {
        return (
          currentTimestamp === null ||
          record.timestamp <
            currentTimestamp
        );
      }
    );

    if (!previous) {
      return null;
    }

    return {
      nav: previous.nav,
      date: previous.date
    };

  } catch (error) {
    console.error(
      'Previous NAV error:',
      error
    );

    return null;
  }
}

function cleanIsin_(value) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return /^IN[A-Z0-9]{10}$/.test(cleaned)
    ? cleaned
    : '';
}

function parseNumber_(value) {
  const parsed = Number(
    String(value || '')
      .replace(/,/g, '')
      .trim()
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseDate_(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();

  const numericMatch = text.match(
    /^(\d{2})-(\d{2})-(\d{4})$/
  );

  if (numericMatch) {
    return Date.UTC(
      Number(numericMatch[3]),
      Number(numericMatch[2]) - 1,
      Number(numericMatch[1])
    );
  }

  const monthMatch = text.match(
    /^(\d{2})-([A-Za-z]{3})-(\d{4})$/
  );

  if (monthMatch) {
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
        monthMatch[2].toLowerCase()
      ];

    if (month === undefined) {
      return null;
    }

    return Date.UTC(
      Number(monthMatch[3]),
      month,
      Number(monthMatch[1])
    );
  }

  return null;
}
