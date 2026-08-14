module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      message: 'Only GET requests are allowed.'
    });
  }

  try {
    const appsScriptUrl =
      process.env.APPS_SCRIPT_API_URL;

    if (!appsScriptUrl) {
      return response.status(500).json({
        success: false,
        message:
          'APPS_SCRIPT_API_URL is not configured in Vercel.'
      });
    }

    const query = new URLSearchParams();

    if (request.query.isin) {
      query.set(
        'isin',
        String(request.query.isin).trim()
      );
    }

    if (request.query.offset) {
      query.set(
        'offset',
        String(request.query.offset)
      );
    }

    if (request.query.limit) {
      query.set(
        'limit',
        String(request.query.limit)
      );
    }

    const separator =
      appsScriptUrl.includes('?') ? '&' : '?';

    const targetUrl = query.toString()
      ? appsScriptUrl +
        separator +
        query.toString()
      : appsScriptUrl;

    const sheetResponse = await fetch(
      targetUrl,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!sheetResponse.ok) {
      throw new Error(
        'Apps Script returned HTTP ' +
        sheetResponse.status
      );
    }

    const sheetData =
      await sheetResponse.json();

    if (!sheetData.success) {
      return response.status(502).json({
        success: false,
        message:
          sheetData.message ||
          'Apps Script could not read the Sheet.'
      });
    }

    response.setHeader(
      'Cache-Control',
      's-maxage=300, stale-while-revalidate=3600'
    );

    return response.status(200).json(
      sheetData
    );

  } catch (error) {
    console.error(
      'Fund master API error:',
      error
    );

    return response.status(500).json({
      success: false,
      message:
        'Unable to fetch fund master data.',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};
