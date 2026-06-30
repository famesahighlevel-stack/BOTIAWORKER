export default {
  async fetch(request, env) {
    // =====================================================
    // CONFIG: GOOGLE APPS SCRIPT
    // =====================================================
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwQPiGNy1jQ-dmq-xz1_ZcPxtQJdTqyVptIXnPKzwi53j5SZ30N3gwdkZsGm7raVXF4/exec";
    const FX_RATE = 7.8; // USD to QTZ
    const CACHE_KEY = "dashboard:cache:v3";
    const CACHE_TTL = 60; // 1 minute

    // =====================================================
    // CONFIG: GHL ACCOUNTS (STRUCTURE UPDATED)
    // =====================================================
    const GHL_ACCOUNTS = [
      {
        "name": "R1.3",
        "location_id": "xr5u7XYR7rI3m9JNlJm7",
        "stage_id": "8577c7cd-5d39-42b4-8edb-ab9bad534119",
        "custom_field": "zUnROtV5c6XbRM4ijUQ1",
        "dataventa_id": "3poEeFSMyn2tPoCKe0Bl",
        "token": "pit-4f8ddf96-7153-4904-a9a9-8434abf9fd83",
        "secuencia_cf": "jn9YrPWrdPdP8XmPVk0T",
        "anuncio_cf": "ampRBMHMXgNhxJMRHl6v",
        "primer_mensaje_cf": "Os7V8p7EFy94syDxUMAx"
      },
      {
        "name": "R2.1",
        "location_id": "qLHT26aMDEKaZ3jGKF9F",
        "stage_id": "bea54a62-b0e8-48e6-a64d-8626319602c8",
        "custom_field": "2uieal4jZiRz3i32fmdr",
        "dataventa_id": "GlbnwixnmUXj8CnEs9sG",
        "token": "pit-a8703b19-ab78-4354-90b8-ed4ab6bfe56e",
        "secuencia_cf": "HHf1OJLjyeqh0xxPf16y",
        "anuncio_cf": "y45Yu0N6yovQFgAS6nG3",
        "primer_mensaje_cf": "n7q6BIlpfvTJm0MBe7VD"
      },
      {
        "name": "R1.2",
        "location_id": "xnCU3r4IN7gVAuZYx5JO",
        "stage_id": "374add3c-e3c3-4b86-a503-9040c407e4e8",
        "custom_field": "a2BH3MSK8ohUszAbW1OO",
        "dataventa_id": "HUuNkuMdON8KJhm4PtAN",
        "token": "pit-7dade6f9-ef3e-4ffc-b6b6-9cdebd93289e",
        "secuencia_cf": "2Ttu4OQ9Fk4qovroFPRN",
        "anuncio_cf": "QovmsXeWCad6fFcDchsM",
        "primer_mensaje_cf": "iIw3cwaAyqt32YwLdAKq"
      },
      {
        "name": "R3.1",
        "location_id": "H3rzWYlQxzBlq3gDRhcC",
        "stage_id": "e576e613-1682-4266-8bfe-d6f86b32d97c",
        "custom_field": "Ek5F3WOOOe7X50a60R0O",
        "dataventa_id": "TO0YPfPJWwaocuiCgbZg",
        "token": "pit-2f261215-2278-4f05-9205-fc9f9bb52681",
        "secuencia_cf": "jsWRYUovvEYgAKddWPly",
        "anuncio_cf": "kRzUfj5Hj43lH6yQdSXh",
        "primer_mensaje_cf": "m2js5X7kAHgjfBjqQhMI"
      },
      {
        "name": "R1.4",
        "location_id": "iT9FHUMSHYmFeGicxlwJ",
        "stage_id": "eeaee2fb-518f-4c78-a696-7cf815414c10",
        "custom_field": "jnAsOVx6j5wxeCHmz0q6",
        "dataventa_id": "kiuo9rQwFoJDf2cEaUJz",
        "token": "pit-404b2e86-443d-46d4-9d89-63da57482598",
        "secuencia_cf": "QfBoKX5vsilncCaDejWU",
        "anuncio_cf": "dpzuI8cV2N9c85NRH5p4",
        "primer_mensaje_cf": "LMVWgaR6LDBdqr6K1rPE"
      }
    ];

    const VENDEDOR_MAP = {
      "MARIA RENE SANTA CRUZ COSAJAY": "MARIA SANTACRUZ",
      "ODILIA NINETTE CALEL CARAU": "ODILIA NINETH CALEL",
      "DIEGO SANTA CRUZ": "DIEGO SANTACRUZ"
    };

    const FREELANCE_VENDEDORES = [
      "BYRON ORTIZ",
      "ESTHER LOPEZ",
      "SONIA CHIROY"
    ];

    // =====================================================
    // FECHA HOY (GT)
    // =====================================================
    const gtDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guatemala",
      year: "numeric", month: "2-digit", day: "2-digit"
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
      // 1. GAS DATA
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

      // 2. META ADS DATA
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
            return {
              name: ins.ad_name, camp: ins.campaign_name, spend: Number(ins.spend || 0),
              conv: Number(conv), code: matchAnu ? matchAnu[1].toUpperCase() : "N/A"
            };
          });
        } catch (e) { return []; }
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

      const allFBAds = [...ads1, ...ads2.map(a => ({...a, spend: a.spend * FX_RATE}))];
      const totalFBLimit = (Number(env.LIMITE_Q) || info1.limit) + ((Number(env.LIMITE_USD) || info2.limit) * FX_RATE);

      // 3. GHL DATA
      let ghlTotalVentas = 0;
      let ghlTotalCantVentas = 0;
      let ghlTotalContactos = 0;
      let ghlStats = [];
      let vendedoraStats = {};
      let adStats = {};
      let contactToAd = {};

      const topAdPerAccount = {};
      allFBAds.forEach(ad => {
        GHL_ACCOUNTS.forEach(acc => {
          if (ad.camp.toUpperCase().includes(acc.name.toUpperCase())) {
            if (!topAdPerAccount[acc.name] || ad.conv > topAdPerAccount[acc.name].conv) {
              topAdPerAccount[acc.name] = ad;
            }
          }
        });
      });

      const accountResults = await Promise.all(GHL_ACCOUNTS.map(async (acc) => {
        let accVentasMonto = 0;
        let accVentasCant = 0;
        let accContactos = 0;
        let userMap = {};

        try {
          const [users, contactsRes] = await Promise.all([
            fetch(`https://services.leadconnectorhq.com/users/?locationId=${acc.location_id}`, { headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2021-07-28" } }).then(r => r.json()),
            fetch("https://services.leadconnectorhq.com/contacts/search", {
              method: "POST",
              headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2021-07-28", "Content-Type": "application/json" },
              body: JSON.stringify({ locationId: acc.location_id, pageLimit: 100, filters: [{ field: "dateAdded", operator: "range", value: { gt: todayStart, lt: todayEnd } }] })
            }).then(r => r.json())
          ]);

          (users.users || []).forEach(u => {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
            userMap[u.id] = VENDEDOR_MAP[name.toUpperCase()] || name;
          });

          const contacts = contactsRes.contacts || [];
          accContactos = contacts.length;
          contacts.forEach(c => {
            let adCode = "N/A";
            (c.customFields || []).forEach(cf => {
              if (cf.id === acc.anuncio_cf || cf.id === acc.primer_mensaje_cf) {
                const match = String(cf.value || "").match(/([A-Z]\d{3,4}[A-Z]\d{3})/i);
                if (match) adCode = match[1].toUpperCase();
              }
            });
            if (adCode === "N/A") {
               (c.customFields || []).forEach(cf => {
                 const match = String(cf.value || "").match(/([A-Z]\d{3,4}[A-Z]\d{3})/i);
                 if (match) adCode = match[1].toUpperCase();
               });
            }
            if (adCode === "N/A" && topAdPerAccount[acc.name]) adCode = topAdPerAccount[acc.name].code;
            contactToAd[c.id] = adCode;
          });

          const oppsRes = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
            method: "POST",
            headers: { "Authorization": `Bearer ${acc.token}`, "Version": "2023-02-21", "Content-Type": "application/json" },
            body: JSON.stringify({ locationId: acc.location_id, limit: 100, filters: [{ group: "AND", filters: [{ field: "pipeline_stage_id", operator: "eq", value: acc.stage_id }, { field: "status", operator: "eq", value: "won" }, { field: `custom_fields.${acc.custom_field}`, operator: "range", value: { gte: todayStart, lte: todayEnd } }] }] })
          });
          const oppsData = await oppsRes.json();
          (oppsData.opportunities || []).forEach(op => {
            const monto = Number(op.monetaryValue) || 0;
            accVentasMonto += monto;
            accVentasCant++;
            const vName = userMap[op.assignedTo] || "Sin Asignar";

            let adCode = contactToAd[op.contactId] || "N/A";
            if (adCode === "N/A" && op.customFields) {
              const dv = op.customFields.find(cf => cf.id === acc.dataventa_id);
              if (dv) {
                const match = String(dv.value || "").match(/([A-Z]\d{3,4}[A-Z]\d{3})/i);
                if (match) adCode = match[1].toUpperCase();
              }
            }
            if (adCode === "N/A" && topAdPerAccount[acc.name]) adCode = topAdPerAccount[acc.name].code;

            if (!vendedoraStats[vName]) vendedoraStats[vName] = { monto: 0, cant: 0 };
            vendedoraStats[vName].monto += monto;
            vendedoraStats[vName].cant++;

            if (!adStats[adCode]) adStats[adCode] = { monto: 0, cantVentas: 0, msgs: 0, spend: 0, vendedora: vName };
            adStats[adCode].monto += monto;
            adStats[adCode].cantVentas++;
          });

        } catch (e) { console.error(`Error GHL ${acc.name}:`, e); }

        return { name: acc.name, ventas: accVentasMonto, cantVentas: accVentasCant, contactos: accContactos };
      }));

      accountResults.forEach(r => {
        ghlTotalVentas += r.ventas;
        ghlTotalCantVentas += r.cantVentas;
        ghlTotalContactos += r.contactos;
        ghlStats.push(r);
      });

      allFBAds.forEach(a => {
        if (!adStats[a.code]) adStats[a.code] = { monto: 0, cantVentas: 0, msgs: 0, spend: 0, vendedora: "" };
        adStats[a.code].spend += a.spend;
        adStats[a.code].msgs += a.conv;
      });

      dashboardData = {
        today, updatedAt: new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" }),
        totalVT, totalBOHoy, totalBOAnterior, totalGeneral: totalBOHoy + totalBOAnterior,
        ghlTotalVentas, ghlTotalCantVentas, ghlTotalContactos, ghlStats,
        vendedoraStats, adStats, totalFBLimit,
        fb1: { ...info1, spend: ads1.reduce((s, a) => s + a.spend, 0) },
        fb2: { balance: info2.balance * FX_RATE, limit: info2.limit * FX_RATE, spend: ads2.reduce((s, a) => s + a.spend, 0) * FX_RATE }
      };

      if (env.PRODUCTS_DB) {
        await env.PRODUCTS_DB.put(CACHE_KEY, JSON.stringify(dashboardData), { expirationTtl: CACHE_TTL });
      }
    }

    const totalFBSpend = dashboardData.fb1.spend + dashboardData.fb2.spend;
    const totalFBBalance = dashboardData.fb1.balance + dashboardData.fb2.balance;

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
        .section-title { font-size: 18px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; margin-top: 25px; }
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
              <thead><tr><th>Canal</th><th>Ventas</th><th>Monto</th><th>Leads</th><th>Conv.</th></tr></thead>
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
              <thead><tr><th>Vendedora</th><th>Ventas</th><th>Monto Total</th><th>Promedio</th></tr></thead>
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

            <div class="section-title">📱 Rendimiento Detallado por Anuncio (Meta + GHL)</div>
            <div style="max-height: 500px; overflow-y: auto; border-radius: 15px; margin-bottom: 25px;">
              <table class="ghl-table" style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; z-index: 10;">
                  <tr><th>Código</th><th>Gasto</th><th>Ventas</th><th>Monto</th><th>Msgs</th><th>Asesor</th><th>Peso</th><th>Conv.</th></tr>
                </thead>
                <tbody>
                  ${Object.entries(dashboardData.adStats).filter(e => e[0] !== "N/A").sort((a,b) => b[1].spend - a[1].spend).map(([code, s]) => {
                    const isFreelance = FREELANCE_VENDEDORES.includes((s.vendedora || "").toUpperCase());
                    const peso = isFreelance ? "0.0%" : ((s.spend / (dashboardData.totalFBLimit || 1)) * 100).toFixed(1) + "%";
                    return `
                    <tr>
                      <td><span style="background: #e7f3ff; color: #007bff; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: monospace;">${code}</span></td>
                      <td>Q${money(s.spend)}</td>
                      <td>${s.cantVentas}</td>
                      <td>Q${money(s.monto)}</td>
                      <td>${s.msgs}</td>
                      <td><small>${s.vendedora || 'N/A'}</small></td>
                      <td><small>${peso}</small></td>
                      <td><strong>${s.msgs > 0 ? ((s.cantVentas / s.msgs) * 100).toFixed(1) : 0}%</strong></td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>

            <div class="section-title">📦 Estado de Pedidos (BO)</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
              <div class="card"><div class="label">BO Hoy</div><div class="value">Q${money(dashboardData.totalBOHoy)}</div></div>
              <div class="card"><div class="label">BO Acumulado Anterior</div><div class="value">Q${money(dashboardData.totalBOAnterior)}</div></div>
            </div>
          </div>

          <div>
            <div class="section-title">💳 Control de Pagos Meta</div>
            <div class="fb-card">
              <div class="label">Cuenta Quetzales (Q)</div>
              <div class="fb-balance">Q${money(dashboardData.fb1.balance)}</div>
              <div style="font-size:12px; color:#65676b">Límite: Q${money(dashboardData.fb1.limit)}</div>
              <div class="progress-container"><div class="progress-bar" style="width: ${Math.min((dashboardData.fb1.balance / (dashboardData.fb1.limit || 1)) * 100, 100)}%; background: ${dashboardData.fb1.balance >= dashboardData.fb1.limit ? '#dc3545' : '#007bff'}"></div></div>
            </div>
            <div class="fb-card">
              <div class="label">Cuenta Dólares ($ -> Q)</div>
              <div class="fb-balance">Q${money(dashboardData.fb2.balance)}</div>
              <div style="font-size:12px; color:#65676b">Límite: Q${money(dashboardData.fb2.limit)}</div>
              <div class="progress-container"><div class="progress-bar" style="width: ${Math.min((dashboardData.fb2.balance / (dashboardData.fb2.limit || 1)) * 100, 100)}%; background: ${dashboardData.fb2.balance >= dashboardData.fb2.limit ? '#dc3545' : '#007bff'}"></div></div>
            </div>
          </div>
        </div>
        <div class="footer">Integralgto VT System &copy; ${new Date().getFullYear()} | Datos en Tiempo Real</div>
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
