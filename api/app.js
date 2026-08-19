'use strict';

const state = {
  inputMode: 'paste',
  imageDataUrl: '',
  lastResult: null
};

const elements = {
  form: document.getElementById('calculator-form'),

  tabs: Array.from(
    document.querySelectorAll(
      '[data-input-mode]'
    )
  ),

  pastePanel:
    document.getElementById('paste-panel'),

  uploadPanel:
    document.getElementById('upload-panel'),

  holdingText:
    document.getElementById('holding-text'),

  imageInput:
    document.getElementById('holding-image'),

  uploadArea:
    document.getElementById('upload-area'),

  imagePreviewContainer:
    document.getElementById(
      'image-preview-container'
    ),

  imagePreview:
    document.getElementById('image-preview'),

  imageName:
    document.getElementById('image-name'),

  removeImage:
    document.getElementById('remove-image'),

  pos:
    document.getElementById('pos'),

  overdue:
    document.getElementById(
      'overdue-charges'
    ),

  resetButton:
    document.getElementById('reset-button'),

  calculateButton:
    document.getElementById(
      'calculate-button'
    ),

  formMessage:
    document.getElementById('form-message'),

  loadingSection:
    document.getElementById(
      'loading-section'
    ),

  loadingMessage:
    document.getElementById(
      'loading-message'
    ),

  resultsSection:
    document.getElementById(
      'results-section'
    ),

  accountStatusCard:
    document.getElementById(
      'account-status-card'
    ),

  accountStatus:
    document.getElementById(
      'account-status'
    ),

  marketValue:
    document.getElementById(
      'total-market-value'
    ),

  grossDp:
    document.getElementById(
      'total-gross-dp'
    ),

  riskDp:
    document.getElementById(
      'total-risk-dp'
    ),

  exposure:
    document.getElementById(
      'total-exposure'
    ),

  limitLabel:
    document.getElementById(
      'limit-result-label'
    ),

  limitValue:
    document.getElementById(
      'limit-result-value'
    ),

  resultPos:
    document.getElementById('result-pos'),

  resultOverdue:
    document.getElementById(
      'result-overdue'
    ),

  warningsCard:
    document.getElementById(
      'warnings-card'
    ),

  warningsList:
    document.getElementById(
      'warnings-list'
    ),

  resultsBody:
    document.getElementById(
      'fund-results-body'
    ),

  downloadButton:
    document.getElementById(
      'download-button'
    ),

  dataStatus:
    document.getElementById(
      'data-status'
    )
};

const currencyFormatter =
  new Intl.NumberFormat(
    'en-IN',
    {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

const quantityFormatter =
  new Intl.NumberFormat(
    'en-IN',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4
    }
  );

initialise_();

function initialise_() {
  elements.tabs.forEach(function (tab) {
    tab.addEventListener(
      'click',
      function () {
        setInputMode_(
          tab.dataset.inputMode
        );
      }
    );

    tab.addEventListener(
      'keydown',
      function (event) {
        if (
          event.key !== 'ArrowLeft' &&
          event.key !== 'ArrowRight'
        ) {
          return;
        }

        event.preventDefault();

        const nextMode =
          state.inputMode === 'paste'
            ? 'upload'
            : 'paste';

        setInputMode_(nextMode);

        const nextTab =
          elements.tabs.find(
            function (item) {
              return (
                item.dataset.inputMode ===
                nextMode
              );
            }
          );

        if (nextTab) {
          nextTab.focus();
        }
      }
    );
  });

  elements.imageInput.addEventListener(
    'change',
    function (event) {
      const file =
        event.target.files &&
        event.target.files[0];

      if (file) {
        selectImage_(file);
      }
    }
  );

  [
    'dragenter',
    'dragover'
  ].forEach(function (eventName) {
    elements.uploadArea.addEventListener(
      eventName,
      function (event) {
        event.preventDefault();

        elements.uploadArea.classList.add(
          'drag-active'
        );
      }
    );
  });

  [
    'dragleave',
    'drop'
  ].forEach(function (eventName) {
    elements.uploadArea.addEventListener(
      eventName,
      function (event) {
        event.preventDefault();

        elements.uploadArea.classList.remove(
          'drag-active'
        );
      }
    );
  });

  elements.uploadArea.addEventListener(
    'drop',
    function (event) {
      const file =
        event.dataTransfer.files &&
        event.dataTransfer.files[0];

      if (file) {
        selectImage_(file);
      }
    }
  );

  elements.removeImage.addEventListener(
    'click',
    clearImage_
  );

  elements.resetButton.addEventListener(
    'click',
    resetCalculator_
  );

  elements.form.addEventListener(
    'submit',
    calculatePortfolio_
  );

  elements.downloadButton.addEventListener(
    'click',
    downloadReport_
  );
}

function setInputMode_(mode) {
  if (
    mode !== 'paste' &&
    mode !== 'upload'
  ) {
    return;
  }

  state.inputMode = mode;

  elements.tabs.forEach(function (tab) {
    const selected =
      tab.dataset.inputMode === mode;

    tab.classList.toggle(
      'active',
      selected
    );

    tab.setAttribute(
      'aria-selected',
      String(selected)
    );

    tab.tabIndex =
      selected ? 0 : -1;
  });

  elements.pastePanel.classList.toggle(
    'hidden',
    mode !== 'paste'
  );

  elements.uploadPanel.classList.toggle(
    'hidden',
    mode !== 'upload'
  );

  hideMessage_();
}

function selectImage_(file) {
  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/webp'
  ];

  const maxBytes =
    4 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    showMessage_(
      'Please select a PNG, JPG, JPEG or WEBP screenshot.'
    );

    clearImage_();
    return;
  }

  if (file.size > maxBytes) {
    showMessage_(
      'The screenshot must be smaller than 4 MB.'
    );

    clearImage_();
    return;
  }

  const reader = new FileReader();

  reader.onload = function () {
    state.imageDataUrl =
      String(reader.result || '');

    elements.imagePreview.src =
      state.imageDataUrl;

    elements.imageName.textContent =
      file.name;

    elements.imagePreviewContainer
      .classList.remove('hidden');

    hideMessage_();
  };

  reader.onerror = function () {
    showMessage_(
      'The selected screenshot could not be read.'
    );

    clearImage_();
  };

  reader.readAsDataURL(file);
}

function clearImage_() {
  state.imageDataUrl = '';

  elements.imageInput.value = '';

  elements.imagePreview.removeAttribute(
    'src'
  );

  elements.imageName.textContent = '';

  elements.imagePreviewContainer
    .classList.add('hidden');
}

async function calculatePortfolio_(event) {
  event.preventDefault();

  hideMessage_();
  hideResults_();

  const pastedText =
    elements.holdingText.value.trim();

  const pos =
    parseMoney_(elements.pos.value);

  const overdueCharges =
    parseMoney_(
      elements.overdue.value
    ) || 0;

  if (
    state.inputMode === 'paste' &&
    !pastedText
  ) {
    showMessage_(
      'Paste the complete holding statement before calculating.'
    );

    elements.holdingText.focus();
    return;
  }

  if (
    state.inputMode === 'upload' &&
    !state.imageDataUrl
  ) {
    showMessage_(
      'Upload a holding-statement screenshot before calculating.'
    );

    return;
  }

  if (pos === null || pos < 0) {
    showMessage_(
      'Enter a valid POS amount.'
    );

    elements.pos.focus();
    return;
  }

  if (overdueCharges < 0) {
    showMessage_(
      'Overdue charges cannot be negative.'
    );

    elements.overdue.focus();
    return;
  }

  setLoading_(
    true,
    'Reading and standardising the holding statement…'
  );

  try {
    const extraction =
      await requestJson_(
        '/api/extract',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            text:
              state.inputMode ===
              'paste'
                ? pastedText
                : '',

            image:
              state.inputMode ===
              'upload'
                ? state.imageDataUrl
                : ''
          })
        }
      );

    setLoading_(
      true,
      'Matching funds, fetching NAVs and calculating limits…'
    );

    const calculation =
      await requestJson_(
        '/api/calculate',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            holdings:
              extraction.holdings,

            pos,

            overdueCharges
          })
        }
      );

    state.lastResult =
      calculation;

    renderResults_(calculation);

  } catch (error) {
    showMessage_(
      error.message ||
      'The portfolio could not be calculated.'
    );

  } finally {
    setLoading_(false);
  }
}

async function requestJson_(
  url,
  options
) {
  const result =
    await fetch(url, options);

  let data;

  try {
    data = await result.json();
  } catch (error) {
    throw new Error(
      'The server returned an unreadable response.'
    );
  }

  if (
    !result.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
      'The request could not be completed.'
    );
  }

  return data;
}

function renderResults_(result) {
  const summary =
    result.accountSummary;

  const status =
    summary.accountStatus;

  elements.accountStatusCard
    .classList.remove(
      'status-safe',
      'status-warning',
      'status-danger'
    );

  if (status === 'NO SHORTFALL') {
    elements.accountStatusCard
      .classList.add('status-safe');

    elements.limitLabel.textContent =
      'Available Limit';

    elements.limitValue.textContent =
      formatCurrency_(
        summary.availableLimit
      );

  } else if (
    status ===
    'PORTFOLIO SHORTFALL WARNING'
  ) {
    elements.accountStatusCard
      .classList.add('status-warning');

    elements.limitLabel.textContent =
      'Gross Shortfall';

    elements.limitValue.textContent =
      formatCurrency_(
        summary.grossShortfall
      );

  } else {
    elements.accountStatusCard
      .classList.add('status-danger');

    elements.limitLabel.textContent =
      'Regulatory Shortfall';

    elements.limitValue.textContent =
      formatCurrency_(
        summary.riskShortfall
      );
  }

  elements.accountStatus.textContent =
    status;

  elements.marketValue.textContent =
    formatCurrency_(
      summary.totalCurrentMarketValue
    );

  elements.grossDp.textContent =
    formatCurrency_(
      summary.totalGrossDrawingPower
    );

  elements.riskDp.textContent =
    formatCurrency_(
      summary.totalRiskDrawingPower
    );

  elements.exposure.textContent =
    formatCurrency_(
      summary.exposure
    );

  elements.resultPos.textContent =
    formatCurrency_(summary.pos);

  elements.resultOverdue.textContent =
    formatCurrency_(
      summary.overdueCharges
    );

  renderWarnings_(
    result.warnings || []
  );

  renderFundRows_(
    result.funds || []
  );

  elements.dataStatus.innerHTML =
    '<span class="status-dot"></span>Latest NAV loaded';

  elements.resultsSection
    .classList.remove('hidden');

  elements.resultsSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function renderWarnings_(warnings) {
  elements.warningsList
    .replaceChildren();

  if (!warnings.length) {
    elements.warningsCard
      .classList.add('hidden');

    return;
  }

  warnings.forEach(function (warning) {
    const item =
      document.createElement('li');

    item.textContent = warning;

    elements.warningsList
      .appendChild(item);
  });

  elements.warningsCard
    .classList.remove('hidden');
}

function renderFundRows_(funds) {
  elements.resultsBody
    .replaceChildren();

  funds.forEach(function (fund) {
    const row =
      document.createElement('tr');

    appendCell_(
      row,
      fund.number
    );

    appendCell_(
      row,
      fund.scripName,
      'fund-name-cell'
    );

    appendCell_(
      row,
      fund.isin || '—'
    );

    appendCell_(
      row,
      formatQuantity_(fund.units)
    );

    appendCell_(
      row,
      formatNav_(fund.previousNav)
    );

    appendCell_(
      row,
      formatNav_(fund.currentNav)
    );

    appendCell_(
      row,
      formatCurrency_(
        fund.currentMarketValue
      )
    );

    appendCell_(
      row,
      formatPercent_(
        fund.internalLtv
      )
    );

    appendCell_(
      row,
      formatCurrency_(
        fund.grossDrawingPower
      )
    );

    appendCell_(
      row,
      formatPercent_(
        fund.riskLtv
      )
    );

    appendCell_(
      row,
      formatCurrency_(
        fund.riskDrawingPower
      )
    );

    const changeClass =
      fund.valueChange > 0
        ? 'positive-value'
        : fund.valueChange < 0
          ? 'negative-value'
          : '';

    appendCell_(
      row,
      formatSignedCurrency_(
        fund.valueChange
      ),
      changeClass
    );

    const statusCell =
      document.createElement('td');

    const badge =
      document.createElement('span');

    const fundStatus =
      fund.movementStatus ||
      fund.calculationStatus ||
      'NOT AVAILABLE';

    badge.className =
      'status-badge ' +
      movementClass_(fundStatus);

    badge.textContent =
      fundStatus;

    badge.title =
      fund.calculationStatus ||
      fundStatus;

    statusCell.appendChild(badge);
    row.appendChild(statusCell);

    elements.resultsBody
      .appendChild(row);
  });
}

function appendCell_(
  row,
  value,
  className
) {
  const cell =
    document.createElement('td');

  cell.textContent =
    value === null ||
    value === undefined ||
    value === ''
      ? '—'
      : String(value);

  if (className) {
    cell.className = className;
  }

  row.appendChild(cell);
}

function movementClass_(status) {
  if (status === 'UP') {
    return 'movement-up';
  }

  if (status === 'DOWN') {
    return 'movement-down';
  }

  return 'movement-neutral';
}

function downloadReport_() {
  if (!state.lastResult) {
    showMessage_(
      'Calculate a portfolio before downloading the report.'
    );

    return;
  }

  const result =
    state.lastResult;

  const summary =
    result.accountSummary;

  const lines = [
    [
      'Account Status',
      summary.accountStatus
    ],
    [
      'Current Market Value',
      summary.totalCurrentMarketValue
    ],
    [
      'Gross Drawing Power',
      summary.totalGrossDrawingPower
    ],
    [
      'Risk Drawing Power',
      summary.totalRiskDrawingPower
    ],
    [
      'POS',
      summary.pos
    ],
    [
      'Overdue Charges',
      summary.overdueCharges
    ],
    [
      'Exposure',
      summary.exposure
    ],
    [
      'Gross Shortfall',
      summary.grossShortfall
    ],
    [
      'Risk Shortfall',
      summary.riskShortfall
    ],
    [
      'Available Limit',
      summary.availableLimit
    ],

    [],

    [
      'No.',
      'Scrip Name',
      'ISIN',
      'AMC Name',
      'Scheme Type',
      'Units',
      'Previous NAV',
      'Current NAV',
      'Previous Market Value',
      'Current Market Value',
      'Internal LTV',
      'Gross Drawing Power',
      'Risk LTV',
      'Risk Drawing Power',
      'NAV Change',
      'NAV Change %',
      'Value Change',
      'Movement Status',
      'Calculation Status'
    ]
  ];

  result.funds.forEach(function (fund) {
    lines.push([
      fund.number,
      fund.scripName,
      fund.isin,
      fund.amcName,
      fund.schemeType,
      fund.units,
      fund.previousNav,
      fund.currentNav,
      fund.previousMarketValue,
      fund.currentMarketValue,
      fund.internalLtv,
      fund.grossDrawingPower,
      fund.riskLtv,
      fund.riskDrawingPower,
      fund.navChange,
      fund.navChangePercent,
      fund.valueChange,
      fund.movementStatus,
      fund.calculationStatus
    ]);
  });

  const csv =
    '\uFEFF' +
    lines
      .map(function (line) {
        return line
          .map(csvValue_)
          .join(',');
      })
      .join('\r\n');

  const blob = new Blob(
    [csv],
    {
      type:
        'text/csv;charset=utf-8'
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = url;

  link.download =
    'fund-portfolio-report-' +
    new Date()
      .toISOString()
      .slice(0, 10) +
    '.csv';

  document.body.appendChild(link);

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function csvValue_(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  const text = String(value);

  return /[",\r\n]/.test(text)
    ? '"' +
      text.replace(
        /"/g,
        '""'
      ) +
      '"'
    : text;
}

function resetCalculator_() {
  elements.form.reset();

  clearImage_();
  hideMessage_();
  hideResults_();
  setLoading_(false);
  setInputMode_('paste');

  state.lastResult = null;

  elements.dataStatus.innerHTML =
    '<span class="status-dot"></span>Latest daily NAV';

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function setLoading_(
  loading,
  message
) {
  elements.loadingSection
    .classList.toggle(
      'hidden',
      !loading
    );

  elements.calculateButton.disabled =
    loading;

  elements.resetButton.disabled =
    loading;

  elements.calculateButton.textContent =
    loading
      ? 'Calculating…'
      : 'Calculate portfolio';

  if (message) {
    elements.loadingMessage.textContent =
      message;
  }
}

function showMessage_(message) {
  elements.formMessage.textContent =
    message;

  elements.formMessage
    .classList.remove('hidden');

  elements.formMessage.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

function hideMessage_() {
  elements.formMessage.textContent = '';

  elements.formMessage
    .classList.add('hidden');
}

function hideResults_() {
  elements.resultsSection
    .classList.add('hidden');
}

function parseMoney_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(
    String(value).replace(
      /[,₹\s]/g,
      ''
    )
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function formatCurrency_(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return currencyFormatter.format(
    Number(value)
  );
}

function formatSignedCurrency_(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  const number =
    Number(value);

  return number > 0
    ? '+' +
      currencyFormatter.format(number)
    : currencyFormatter.format(number);
}

function formatQuantity_(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return quantityFormatter.format(
    Number(value)
  );
}

function formatNav_(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return (
    '₹' +
    Number(value).toLocaleString(
      'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      }
    )
  );
}

function formatPercent_(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  return (
    (
      Number(value) * 100
    ).toFixed(2) +
    '%'
  );
}

