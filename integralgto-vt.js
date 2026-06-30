export default {
  async fetch(request, env) {
    // =====================================================
    // CONFIG: GOOGLE APPS SCRIPT
    // =====================================================
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwQPiGNy1jQ-dmq-xz1_ZcPxtQJdTqyVptIXnPKzwi53j5SZ30N3gwdkZsGm7raVXF4/exec";
    const FX_RATE = 7.8; // USD to QTZ
    const CACHE_KEY = "dashboard:cache:v1";
    const CACHE_TTL = 60; // 1 minute

    // =====================================================
    // CONFIG: GHL ACCOUNTS
    // =====================================================
    const GHL_ACCOUNTS = [
      { name: "R1.3", location: "xr5u7XYR7rI3m9JNlJm7", stage: "8577c7cd-5d39-42b4-8edb-ab9bad534119", token: "pit-4f8ddf96-7153-4904-a9a9-8434abf9fd83", field_fv: "zUnROtV5c6XbRM4ijUQ1", dv_id: "3poEeFSMyn2tPoCKe0Bl" },
      { name: "R2.1", location: "qLHT26aMDEKaZ3jGKF9F", stage: "bea54a62-b0e8-48e6-a64d-8626319602c8", token: "pit-a8703b19-ab78-4354-90b8-ed4ab6bfe56e", field_fv: "2uieal4jZiRz3i32fmdr", dv_id: "GlbnwixnmUXj8CnEs9sG" },
      { name: "R1.2", location: "xnCU3r4IN7gVAuZYx5JO", stage: "374add3c-e3c3-4b86-a503-9040c407e4e8", token: "pit-7dade6f9-ef3e-4ffc-b6b6-9cdebd93289e", field_fv: "a2BH3MSK8ohUszAbW1OO", dv_id: "HUuNkuMdON8KJhm4PtAN" },
      { name: "R3.1", location: "H3rzWYlQxzBlq3gDRhcC", stage: "e576e613-1682-4266-8bfe-d6f86b32d97c", token: "pit-2f261215-2278-4f05-9205-fc9f9bb52681", field_fv: "Ek5F3WOOOe7X50a60R0O", dv_id: "TO0YPfPJWwaocuiCgbZg" },
      { name: "R1.4", location: "iT9FHUMSHYmFeGicxlwJ", stage: "eeaee2fb-518f-4c78-a696-7cf815414c10", token: "pit-404b2e86-443d-46d4-9d89-63da57482598", field_fv: "jnAsOVx6j5wxeCHmz0q6", dv_id: "kiuo9rQwFoJDf2cEaUJz" }
    ];

    const VENDEDOR_MAP = {
      "MARIA RENE SANTA CRUZ COSAJAY": "MARIA SANTACRUZ",
      "ODILIA NINETTE CALEL CARAU": "ODILIA NINETH CALEL",
    };

    // =====================================================
    // FECHA HOY (GT)
    // =====================================================
    // Usamos Intl para obtener la fecha actual en Guatemala (UTC-6)
    const gtDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guatemala",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    const today = gtDateStr;
    const todayStart = today + "T00:00:00.000Z";
    const todayEnd = today + "T23:59:59.999Z";

    // =====================================================
    // CACHE LOGIC
    // =====================================================
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    let dashboardData = null;
    if (!forceRefresh && env.PRODUCTS_DB) {
      const cached = await env.PRODUCTS_DB.get(CACHE_KEY, "json");
      if (cached && cached.today === today) {
        dashboardData = cached;
      }
    }

    if (!dashboardData) {
      // =====================================================
      // 1. CONSULTA VT / BO (GAS)
      // =====================================================
      let vt = [], bo = [];
      try {
        const gasRes = await fetch(GAS_URL + "?ruta=");
        const gasData = await gasRes.json();
        vt = gasData.vt || [];
        bo = gasData.bo || [];
      } catch (e) { console.error("Error GAS:", e); }

      const totalVT = vt.filter(r => r.Fecha && r.Fecha.split("T")[0] === today).reduce((acc, row) => acc + (Number(row.QMonto) || 0), 0);
      const totalBOHoy = bo.filter(r => r.FechaCreado && r.FechaCreado.split("T")[0] === today).reduce((acc, row) => acc + (Number(row.TPedidoQTZ) || 0), 0);
      const totalBOAnterior = bo.filter(r => r.FechaCreado && r.FechaCreado.split("T")[0] < today).reduce((acc, row) => acc + (Number(row.TPedidoQTZ) || 0), 0);

      // =====================================================
      // 2. CONSULTA GHL (Opps & Contacts)
      // =====================================================
      let ghlTotalVentas = 0;
      let ghlTotalCantVentas = 0;
      let ghlTotalContactos = 0;
      let ghlStats = [];

      let vendedoraStats = {};

      for (const acc of GHL_ACCOUNTS) {
        let accVentasMonto = 0;
        let accVentasCant = 0;
        let accContactos = 0;

        // Fetch Users for current account to map IDs to names
        let userMap = {};
        try {
          const userRes = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${acc.location}`, {
            headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2021-07-28" }
          });
          const userData = await userRes.json();
          (userData.users || []).forEach(u => {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
            userMap[u.id] = VENDEDOR_MAP[name.toUpperCase()] || name;
          });
        } catch (e) { console.error(`Error GHL Users ${acc.name}:`, e); }

        // Opps (Sales) - Sin paginación agresiva para evitar límite de 50 subrequests de Workers
        try {
          const oppRes = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
            method: "POST",
            headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2023-02-21", "Content-Type": "application/json" },
            body: JSON.stringify({ locationId: acc.location, limit: 100, filters: [{ group: "AND", filters: [{ field: "pipeline_stage_id", operator: "eq", value: acc.stage }, { field: "status", operator: "eq", value: "won" }, { field: `custom_fields.${acc.field_fv}`, operator: "range", value: { gte: todayStart, lte: todayEnd } }] }] })
          });
          const oppData = await oppRes.json();
          (oppData.opportunities || []).forEach(op => {
            const monto = Number(op.monetaryValue) || 0;
            accVentasMonto += monto;
            accVentasCant++;
            const vName = userMap[op.assignedTo] || "Sin Asignar";
            if (!vendedoraStats[vName]) vendedoraStats[vName] = { monto: 0, cant: 0 };
            vendedoraStats[vName].monto += monto;
            vendedoraStats[vName].cant++;
          });
        } catch (e) { console.error(`Error GHL Opps ${acc.name}:`, e); }

        // Contacts
        try {
          const conRes = await fetch("https://services.leadconnectorhq.com/contacts/search", {
            method: "POST",
            headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2021-07-28", "Content-Type": "application/json" },
            body: JSON.stringify({ locationId: acc.location, pageLimit: 100, filters: [{ field: "dateAdded", operator: "range", value: { gt: todayStart, lt: todayEnd } }] })
          });
          const conData = await conRes.json();
          accContactos = (conData.contacts || []).length;
        } catch (e) { console.error(`Error GHL Contacts ${acc.name}:`, e); }

        ghlTotalVentas += accVentasMonto;
        ghlTotalCantVentas += accVentasCant;
        ghlTotalContactos += accContactos;
        ghlStats.push({ name: acc.name, ventas: accVentasMonto, cantVentas: accVentasCant, contactos: accContactos });
      }

      // =====================================================
      // 3. META ADS DATA (DETAILED)
      // =====================================================
      async function getFBInsights(accountId) {
        if (!accountId || accountId === "") return [];
        const cleanId = accountId.toString().startsWith("act_") ? accountId : `act_${accountId}`;
        const timeRange = JSON.stringify({ "since": today, "until": today });
        try {
          const res = await fetch(`https://graph.facebook.com/v23.0/${cleanId}/insights?fields=ad_name,campaign_name,spend,actions&time_range=${encodeURIComponent(timeRange)}&level=ad&limit=500&access_token=${env.ACCESS_TOKEN}`);
          const data = await res.json();
          return (data.data || []).map(ins => {
            const conv = (ins.actions || []).find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;
            const matchAnu = ins.ad_name.match(/([A-Z]\d{3,4}[A-Z]\d{3})/i);
            const matchPrice = ins.ad_name.match(/\.(\d+)/);
            return {
              name: ins.ad_name,
              camp: ins.campaign_name,
              spend: Number(ins.spend || 0),
              conv: Number(conv),
              code: matchAnu ? matchAnu[1] : "N/A",
              price: matchPrice ? matchPrice[1] : "N/A"
            };
          });
        } catch (e) { console.error(`Error FB Insights ${cleanId}:`, e); return []; }
      }

      async function getFBAccountInfo(accountId, fallbackLimit) {
        if (!accountId || accountId === "") return { balance: 0, limit: Number(fallbackLimit || 0) };
        const cleanId = accountId.toString().startsWith("act_") ? accountId : `act_${accountId}`;
        try {
          const [acc, cyc] = await Promise.all([
            fetch(`https://graph.facebook.com/v23.0/${cleanId}?fields=balance&access_token=${env.ACCESS_TOKEN}`).then(r => r.json()),
            fetch(`https://graph.facebook.com/v23.0/${cleanId}?fields=adspaymentcycle&access_token=${env.ACCESS_TOKEN}`).then(r => r.json())
          ]);
          const threshold = cyc.adspaymentcycle?.data?.[0]?.threshold_amount;
          return {
            balance: Number(acc.balance || 0) / 100,
            limit: threshold ? Number(threshold) / 100 : Number(fallbackLimit || 0)
          };
        } catch (e) { return { balance: 0, limit: Number(fallbackLimit || 0) }; }
      }

      const [ads1, ads2, info1, info2] = await Promise.all([
        getFBInsights(env.AD_ACCOUNT_ID),
        getFBInsights(env.AD_ACCOUNT_ID_2),
        getFBAccountInfo(env.AD_ACCOUNT_ID, env.LIMITE_Q || 4500),
        getFBAccountInfo(env.AD_ACCOUNT_ID_2, env.LIMITE_USD || 0)
      ]);

      const allAds = [
        ...ads1.map(a => ({ ...a, spendQ: a.spend })),
        ...ads2.map(a => ({ ...a, spendQ: a.spend * FX_RATE }))
      ];

      dashboardData = {
        today,
        updatedAt: new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" }),
        totalVT, totalBOHoy, totalBOAnterior, totalGeneral: totalBOHoy + totalBOAnterior,
        ghlTotalVentas, ghlTotalCantVentas, ghlTotalContactos, ghlStats,
        vendedoraStats,
        fb1: { ...info1, spend: ads1.reduce((s, a) => s + a.spend, 0) },
        fb2: { balance: info2.balance * FX_RATE, limit: info2.limit * FX_RATE, spend: ads2.reduce((s, a) => s + a.spend, 0) * FX_RATE },
        allAds
      };

      if (env.PRODUCTS_DB) {
        await env.PRODUCTS_DB.put(CACHE_KEY, JSON.stringify(dashboardData), { expirationTtl: CACHE_TTL });
      }
    }

    // Calculations
    const totalFBSpend = dashboardData.fb1.spend + dashboardData.fb2.spend;
    const totalFBBalance = dashboardData.fb1.balance + dashboardData.fb2.balance;

    // =====================================================
    // HTML
    // =====================================================
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Super Dashboard Integral GTO</title>
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { margin: 0; padding: 20px; background: #f0f2f5; color: #1c1e21; }
        .container { max-width: 1400px; margin: auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: #fff; padding: 20px; border-radius: 15px; box-shadow: 0 2px 4px rgba(0,0,0,.05); }
        h1 { margin: 0; font-size: 24px; color: #007bff; }
        .btn-refresh { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; }

        .grid-6 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
        .card { background: #fff; padding: 20px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,.05); text-align: center; }
        .label { font-size: 13px; color: #65676b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .value { font-size: 22px; font-weight: 700; }

        .section-title { font-size: 18px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .section-title i { color: #007bff; }

        .main-grid { display: grid; grid-template-columns: 2.2fr 1fr; gap: 25px; }
        @media (max-width: 1000px) { .main-grid { grid-template-columns: 1fr; } }

        .ghl-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 15px; overflow: hidden; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,.05); }
        .ghl-table th, .ghl-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #f0f2f5; font-size: 14px; }
        .ghl-table th { background: #f8f9fa; font-weight: 600; color: #65676b; }

        .fb-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; }
        .fb-balance { font-size: 32px; font-weight: 800; color: #007bff; margin: 10px 0; }
        .progress-container { background: #e9ecef; height: 10px; border-radius: 5px; margin: 15px 0; overflow: hidden; }
        .progress-bar { background: #007bff; height: 100%; transition: width 0.3s; }
        .alert { background: #fff3cd; color: #856404; padding: 10px; border-radius: 8px; font-size: 13px; margin-top: 10px; border: 1px solid #ffeeba; }
        .danger { background: #f8d7da; color: #721c24; border-color: #f5c6cb; }

        .footer { text-align: center; margin-top: 40px; color: #65676b; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <h1>🚀 Dashboard Comercial Real-Time</h1>
            <div style="color:#65676b; font-size:14px; margin-top:5px;">Actualizado: ${dashboardData.updatedAt}</div>
          </div>
          <button class="btn-refresh" onclick="location.href='?refresh=true'">🔄 Sincronizar Datos</button>
        </div>

        <div class="grid-6">
          <div class="card"><div class="label">VT Hoy (GAS)</div><div class="value" style="color:#28a745">Q${money(dashboardData.totalVT)}</div></div>
          <div class="card"><div class="label">BO Hoy (GAS)</div><div class="value" style="color:#dc3545">Q${money(dashboardData.totalBOHoy)}</div></div>
          <div class="card"><div class="label">Ventas GHL Hoy</div><div class="value" style="color:#007bff">Q${money(dashboardData.ghlTotalVentas)}</div></div>
          <div class="card"><div class="label">Nuevos Leads</div><div class="value" style="color:#6f42c1">${dashboardData.ghlTotalContactos}</div></div>
          <div class="card"><div class="label">Gasto Ads Hoy</div><div class="value">Q${money(totalFBSpend)}</div></div>
          <div class="card"><div class="label">Saldo Ads Pendiente</div><div class="value" style="color:#007bff">Q${money(totalFBBalance)}</div></div>
        </div>

        <div class="main-grid">
          <div>
            <div class="section-title">📊 Rendimiento por Canal (GHL)</div>
            <table class="ghl-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Ventas</th>
                  <th>Monto</th>
                  <th>Leads</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody>
                ${dashboardData.ghlStats.map(s => `
                  <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.cantVentas}</td>
                    <td>Q${money(s.ventas)}</td>
                    <td>${s.contactos}</td>
                    <td>${s.contactos > 0 ? ((s.cantVentas / s.contactos) * 100).toFixed(1) : 0}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="section-title">👩‍💼 Ventas por Vendedora (GHL)</div>
            <table class="ghl-table">
              <thead>
                <tr>
                  <th>Vendedora</th>
                  <th>Ventas</th>
                  <th>Monto Total</th>
                  <th>Promedio</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(dashboardData.vendedoraStats).sort((a,b) => b[1].monto - a[1].monto).map(([name, s]) => `
                  <tr>
                    <td><strong>${name}</strong></td>
                    <td>${s.cant}</td>
                    <td>Q${money(s.monto)}</td>
                    <td>Q${money(s.monto / (s.cant || 1))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="section-title">📱 Rendimiento por Anuncio (Meta)</div>
            <div style="max-height: 400px; overflow-y: auto; border-radius: 15px; margin-bottom: 25px;">
              <table class="ghl-table" style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; z-index: 10;">
                  <tr>
                    <th>Código</th>
                    <th>Precio</th>
                    <th>Gasto (Q)</th>
                    <th>Msgs</th>
                    <th>Costo/Msg</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboardData.allAds.sort((a,b) => b.spendQ - a.spendQ).map(ad => `
                    <tr>
                      <td><span style="background: #e7f3ff; color: #007bff; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: monospace;">${ad.code}</span></td>
                      <td>Q${ad.price}</td>
                      <td>Q${money(ad.spendQ)}</td>
                      <td>${ad.conv}</td>
                      <td>Q${ad.conv > 0 ? money(ad.spendQ / ad.conv) : '0.00'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section-title">📦 Estado de Pedidos (BO)</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
              <div class="card">
                <div class="label">BO Hoy</div>
                <div class="value">Q${money(dashboardData.totalBOHoy)}</div>
              </div>
              <div class="card">
                <div class="label">BO Acumulado Anterior</div>
                <div class="value">Q${money(dashboardData.totalBOAnterior)}</div>
              </div>
            </div>
          </div>

          <div>
            <div class="section-title">💳 Control de Pagos Meta</div>

            <!-- CUENTA Q -->
            <div class="fb-card">
              <div class="label">Cuenta Quetzales (Q)</div>
              <div class="fb-balance">Q${money(dashboardData.fb1.balance)}</div>
              <div style="font-size:12px; color:#65676b">Límite de Facturación: Q${money(dashboardData.fb1.limit)}</div>
              <div class="progress-container">
                <div class="progress-bar" style="width: ${Math.min((dashboardData.fb1.balance / (dashboardData.fb1.limit || 1)) * 100, 100)}%; background: ${dashboardData.fb1.balance >= dashboardData.fb1.limit ? '#dc3545' : '#007bff'}"></div>
              </div>
              ${dashboardData.fb1.balance >= dashboardData.fb1.limit ? '<div class="alert danger">⚠️ LÍMITE ALCANZADO O EXCEDIDO</div>' : '<div class="alert">Próximo cobro al llegar al límite.</div>'}
            </div>

            <!-- CUENTA USD -->
            <div class="fb-card">
              <div class="label">Cuenta Dólares ($ -> Q)</div>
              <div class="fb-balance">Q${money(dashboardData.fb2.balance)}</div>
              <div style="font-size:12px; color:#65676b">Límite: Q${money(dashboardData.fb2.limit)}</div>
              <div class="progress-container">
                <div class="progress-bar" style="width: ${Math.min((dashboardData.fb2.balance / (dashboardData.fb2.limit || 1)) * 100, 100)}%; background: ${dashboardData.fb2.balance >= dashboardData.fb2.limit ? '#dc3545' : '#007bff'}"></div>
              </div>
              ${dashboardData.fb2.balance >= dashboardData.fb2.limit ? '<div class="alert danger">⚠️ LÍMITE ALCANZADO O EXCEDIDO</div>' : '<div class="alert">Cifras convertidas a QTZ para control unificado.</div>'}
            </div>
          </div>
        </div>

        <div class="footer">
          Integralgto VT System &copy; ${new Date().getFullYear()} | Datos en Tiempo Real
        </div>
      </div>
    </body>
    </html>
    `;

    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};

function money(n) {
  return Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
