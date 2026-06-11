/**
 * META EXPERT - LANZADOR DE PUBLICIDAD INTEGRADO (CLOUDFLARE WORKER)
 * Versión Unificada: Interfaz Visual + Lógica de Automatización
 */

const API_VERSION = "v19.0";
const FIXED_TEXT = "📲 ¡Escríbenos ahora y recibe tu cotización con promoción especial!\n📦 Entregas a todo el país\n💯 Garantía asegurada";

// --- HANDLERS DE API (LOGICA DE NEGOCIO) ---

async function handleGetAccounts(env) {
  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/me/accounts?access_token=${env.META_ACCESS_TOKEN}&limit=100`);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleMetaSearch(body, env) {
  const url = `https://graph.facebook.com/${API_VERSION}/search?type=${body.type}&q=${encodeURIComponent(body.q)}&access_token=${env.META_ACCESS_TOKEN}&limit=10`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleOpenAIGenerate(body, env) {
  try {
    const prompt = body.prompt || "Genera un anuncio para este producto.";
    const messages = [
      { "role": "system", "content": "Eres un experto en Copywriting para Facebook Ads. Responde siempre en formato JSON con llaves 'texto' y 'titulo'. No incluyas markdown, solo el JSON puro." }
    ];

    if (body.image) {
      messages.push({
        "role": "user",
        "content": [
          { "type": "text", "text": prompt },
          { "type": "image_url", "image_url": { "url": body.image } }
        ]
      });
    } else {
      messages.push({ "role": "user", "content": prompt });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        "model": "gpt-4o-mini",
        "messages": messages,
        "max_tokens": 500
      })
    });
    const d = await r.json();
    if (d.error) {
      console.error("OpenAI Error:", JSON.stringify(d.error));
      return new Response(JSON.stringify({ error: d.error.message || "Error de OpenAI" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("handleOpenAIGenerate exception:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleGetInsights(body, env) {
  const accId = body.id || env.AD_ACCOUNT_ID;
  const url = `https://graph.facebook.com/${API_VERSION}/${accId}/insights?level=${body.level}&date_preset=${body.range}&fields=spend,clicks,impressions,reach&access_token=${env.META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetActiveCampaigns(env) {
  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${env.AD_ACCOUNT_ID}/campaigns?fields=name,status,objective,buying_type&access_token=${env.META_ACCESS_TOKEN}&limit=100`);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetAdSets(body, env) {
  const campaignId = body.campaignId;
  const url = `https://graph.facebook.com/${API_VERSION}/${campaignId}/adsets?fields=name,status,optimization_goal,billing_event,bid_amount,daily_budget,lifetime_budget,targeting,promoted_object,destination_type&access_token=${env.META_ACCESS_TOKEN}&limit=100`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetAds(body, env) {
  const adsetId = body.adsetId;
  const url = `https://graph.facebook.com/${API_VERSION}/${adsetId}/ads?fields=name,status,creative{id,name,object_story_spec,video_data,link_data}&access_token=${env.META_ACCESS_TOKEN}&limit=100`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetCustomAudiences(env) {
  const url = `https://graph.facebook.com/${API_VERSION}/${env.AD_ACCOUNT_ID}/customaudiences?fields=name,description,approximate_count_lower_bound&access_token=${env.META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetInstagramAccounts(body, env) {
  const pageId = body.pageId;
  const url = `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=instagram_business_account&access_token=${env.META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetMessageTemplates(body, env) {
  const pageId = body.pageId;
  const url = `https://graph.facebook.com/${API_VERSION}/${pageId}/message_templates?access_token=${env.META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleValidateSetup(env) {
  const token = env.META_ACCESS_TOKEN;
  const accId = env.AD_ACCOUNT_ID;
  const results = {
    token: { status: 'ok', message: 'Verificando...' },
    account: { status: 'ok', message: 'Verificando...' },
    permissions: []
  };

  try {
    const pRes = await fetch(`https://graph.facebook.com/${API_VERSION}/me/permissions?access_token=${token}`);
    const pData = await pRes.json();
    if (pData.error) {
      results.token = { status: 'error', message: pData.error.message };
    } else {
      results.permissions = pData.data || [];
      const required = ['ads_management', 'ads_read', 'pages_manage_ads'];
      const granted = results.permissions.filter(p => p.status === 'granted').map(p => p.permission);
      const missing = required.filter(req => !granted.includes(req));

      if (missing.length > 0) {
        results.token = { status: 'warning', message: `Faltan permisos clave: ${missing.join(', ')}` };
      } else {
        results.token = { status: 'ok', message: 'Token válido con permisos de administrador.' };
      }
    }

    if (accId) {
      let fullAccId = accId.startsWith('act_') ? accId : 'act_' + accId;
      const aRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${fullAccId}?fields=account_status,disable_reason,currency&access_token=${token}`);
      const aData = await aRes.json();
      if (aData.error) {
        results.account = { status: 'error', message: aData.error.message };
      } else {
        const statuses = { 1: 'ACTIVA', 2: 'DESHABILITADA', 3: 'EN REVISIÓN', 7: 'PENDIENTE CIERRE', 9: 'RESTRINGIDA', 100: 'PREPAGO_VACÍO', 101: 'DEUDA' };
        results.account = {
          status: aData.account_status === 1 ? 'ok' : 'error',
          message: `Cuenta ${statuses[aData.account_status] || 'ID:'+aData.account_status}. Moneda: ${aData.currency}`
        };
      }
    }
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleCheckPermissions(env) {
  console.log("Iniciando validación de configuración completa...");
  return await handleValidateSetup(env);
}

async function handleGetTokenInfo(env) {
  console.log("Depurando token de acceso...");
  const r = await fetch(`https://graph.facebook.com/debug_token?input_token=${env.META_ACCESS_TOKEN}&access_token=${env.META_ACCESS_TOKEN}`);
  const d = await r.json();
  console.log("Resultado debug_token:", JSON.stringify(d));
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleUpdateStatus(body, env) {
  const { id, status } = body;
  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, access_token: env.META_ACCESS_TOKEN })
  });
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetFullReport(body, env) {
  try {
    const acc = env.AD_ACCOUNT_ID;
    const { start, end } = body;
    const time_range = JSON.stringify({ since: start, until: end });
    const token = env.META_ACCESS_TOKEN;

    // We split the request into 3 flatter calls to avoid "reduce amount of data" errors from Meta
    const campUrl = `https://graph.facebook.com/${API_VERSION}/${acc}/campaigns?fields=name,status,insights.time_range(${time_range}){spend,impressions,reach,actions}&access_token=${token}&limit=100`;
    const asUrl = `https://graph.facebook.com/${API_VERSION}/${acc}/adsets?fields=name,status,campaign_id,insights.time_range(${time_range}){spend,impressions,reach,actions}&access_token=${token}&limit=150`;
    const adUrl = `https://graph.facebook.com/${API_VERSION}/${acc}/ads?fields=name,status,adset_id,creative{thumbnail_url},insights.time_range(${time_range}){spend,impressions,reach,actions}&access_token=${token}&limit=300`;

    const [campRes, asRes, adRes] = await Promise.all([
      fetch(campUrl),
      fetch(asUrl),
      fetch(adUrl)
    ]);

    const campData = await campRes.json();
    const asData = await asRes.json();
    const adData = await adRes.json();

    if (campData.error) throw new Error(campData.error.message);

    const campaigns = campData.data || [];
    const adsets = asData.data || [];
    const ads = adData.data || [];

    // Combine data locally
    const integratedData = campaigns.map(camp => {
      const campAdsets = adsets
        .filter(as => as.campaign_id === camp.id)
        .map(as => {
          const asAds = ads.filter(ad => ad.adset_id === as.id);
          return { ...as, ads: asAds };
        });
      return { ...camp, adsets: campAdsets };
    });

    return new Response(JSON.stringify({ data: integratedData }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleResolveRegions(body, env) {
  const depts = body.depts || [];
  const token = env.META_ACCESS_TOKEN;
  console.log(`Resolviendo ${depts.length} regiones...`);
  const promises = depts.map(async (dept) => {
    try {
      const r = await fetch(`https://graph.facebook.com/${API_VERSION}/search?type=adgeolocation&q=${encodeURIComponent(dept)}&location_types=['region']&access_token=${token}`);
      const d = await r.json();
      if (d.data && d.data.length > 0) {
        const match = d.data.find(it => it.country_code === 'GT') || d.data[0];
        console.log(`Región resuelta: ${dept} -> ${match.key}`);
        return { key: match.key };
      }
    } catch (e) {
      console.error(`Error resolviendo región ${dept}:`, e);
    }
    return null;
  });
  const results = await Promise.all(promises);
  return new Response(JSON.stringify({ regions: results.filter(r => r !== null) }), { headers: { "Content-Type": "application/json" } });
}

async function handleUploadMedia(formData, env) {
  const file = formData.get('file');
  const token = env.META_ACCESS_TOKEN;
  let acc = env.AD_ACCOUNT_ID;
  if (acc && !acc.startsWith('act_')) acc = 'act_' + acc;

  console.log(`Iniciando subida de archivo a cuenta ${acc}: ${file.name}`);

  try {
    if (file.type.startsWith('image')) {
      const ifd = new FormData();
      ifd.append('access_token', token);
      ifd.append('bytes', file);
      const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adimages`, { method: 'POST', body: ifd });
      const d = await r.json();
      if (!d.images) {
        console.error("Error AdImages:", JSON.stringify(d));
        throw new Error(d.error?.message || "Fallo subida de imagen");
      }
      const hash = Object.values(d.images)[0].hash;
      console.log(`Imagen subida: ${hash}`);
      return new Response(JSON.stringify({ id: hash, type: 'img' }), { headers: { "Content-Type": "application/json" } });
    } else {
      const vfd = new FormData();
      vfd.append('access_token', token);
      vfd.append('source', file);
      const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/advideos`, { method: 'POST', body: vfd });
      const d = await r.json();
      if (!d.id) {
        console.error("Error AdVideos:", JSON.stringify(d));
        throw new Error(d.error?.message || "Fallo subida de video");
      }
      console.log(`Video subido: ${d.id}`);
      return new Response(JSON.stringify({ id: d.id, type: 'vid' }), { headers: { "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("Error fatal en handleUploadMedia:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleCreateAdvancedAd(body, env) {
  const config = body.config;
  const token = env.META_ACCESS_TOKEN;
  let acc = env.AD_ACCOUNT_ID;
  if (acc && !acc.startsWith('act_')) acc = 'act_' + acc;

  console.log(`[Worker] Iniciando publicación en cuenta: ${acc}`);

  // Audit permissions again in logs
  try {
    const pRes = await fetch(`https://graph.facebook.com/${API_VERSION}/me/permissions?access_token=${token}`);
    const pData = await pRes.json();
    console.log(`[Worker] Permisos detectados: ${JSON.stringify(pData.data)}`);
  } catch(e) { console.error("[Worker] Error verificando permisos internos:", e.message); }

  try {
    let mediaId = config.mediaId;
    let mediaType = config.mediaType;

    let campaignId = config.campaignId;
    if (campaignId === "NEW") {
      console.log(`[Worker] Creando campaña: ${config.campaignName}`);
      const cr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/campaigns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.campaignName,
          objective: config.objective,
          buying_type: 'AUCTION',
          status: config.status,
          access_token: token
        })
      });
      const cd = await cr.json();
      if (!cd.id) throw new Error("Error creando campaña: " + (cd.error?.message || JSON.stringify(cd)));
      campaignId = cd.id;
      console.log(`Campaña creada: ${campaignId}`);
    }

    let adSetId = config.adSetId;
    if (adSetId === "NEW") {
      console.log(`[Worker] Creando AdSet: ${config.adSetName}`);
      const destinations = [];
      if(config.messagingDestinations.messenger) destinations.push('MESSENGER');
      if(config.messagingDestinations.instagram) destinations.push('INSTAGRAM_DIRECT');
      if(config.messagingDestinations.whatsapp) destinations.push('WHATSAPP_MESSAGE');

      const asb = {
        name: config.adSetName,
        campaign_id: campaignId,
        optimization_goal: 'CONVERSATIONS',
        billing_event: 'IMPRESSIONS',
        daily_budget: config.budgetAmount * 100,
        destination_type: destinations,
        promoted_object: { page_id: config.pageId },
        targeting: {
          geo_locations: { countries: ['GT'] },
          age_min: parseInt(config.manualAudience.ageMin) || 18,
          publisher_platforms: Object.keys(config.platforms).filter(p => config.platforms[p]),
          targeting_automation: { advantage_audience: 1 } // Captar nuevos clientes / Advantage+
        },
        status: config.status,
        access_token: token
      };

      if (config.startDate) {
        // Meta API expects ISO 8601 or YYYY-MM-DD format with time, or it might fail if just date is given
        // Let's ensure it has a time if it looks like just a date
        asb.start_time = config.startDate.includes('T') ? config.startDate : config.startDate + 'T00:00:00-0600';
      }

      if (config.resolvedRegions && config.resolvedRegions.length > 0) {
        asb.targeting.geo_locations.regions = config.resolvedRegions;
        delete asb.targeting.geo_locations.countries;
      }

      if(config.audienceId) asb.targeting.custom_audiences = [{id: config.audienceId}];

      const asr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adsets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asb)
      });
      const asrd = await asr.json();
      if (!asrd.id) throw new Error("Error creando conjunto: " + (asrd.error?.message || JSON.stringify(asrd)));
      adSetId = asrd.id;
      console.log(`Conjunto creado: ${adSetId}`);
    }

    let creativeId;

    // If editing and no new media, fetch existing creative details
    let existingMediaId = null;
    let existingMediaType = null;
    if (config.adId !== "NEW" && !mediaId) {
      const adr = await fetch(`https://graph.facebook.com/${API_VERSION}/${config.adId}?fields=creative{id,object_story_spec}&access_token=${token}`);
      const adrd = await adr.json();
      const spec = adrd.creative?.object_story_spec;
      if (spec) {
        if (spec.link_data) {
          existingMediaId = spec.link_data.image_hash;
          existingMediaType = 'img';
        } else if (spec.video_data) {
          existingMediaId = spec.video_data.video_id;
          existingMediaType = 'vid';
        }
      }
    }

    const finalMediaId = mediaId || existingMediaId;
    const finalMediaType = mediaType || existingMediaType;

    if (finalMediaId) {
      console.log(`Configurando AdCreative con Media ${finalMediaId}...`);
      const finalMsg = `${config.primaryText}\n\n${FIXED_TEXT}`;
      const cb = {
        name: config.adName + " " + Date.now(),
        object_story_spec: {
          page_id: config.pageId,
          instagram_actor_id: config.instagramId || undefined
        },
        access_token: token
      };

      if (finalMediaType === 'img') {
        cb.object_story_spec.link_data = {
          image_hash: finalMediaId,
          message: finalMsg,
          name: config.headline,
          call_to_action: { type: 'MESSAGE_PAGE' },
          link: `https://facebook.com/${config.pageId}`
        };
      } else if (finalMediaType === 'vid') {
        cb.object_story_spec.video_data = {
          video_id: finalMediaId,
          message: finalMsg,
          call_to_action: { type: 'MESSAGE_PAGE', value: { link: `https://facebook.com/${config.pageId}` } }
        };
      }

      // Message Template Creation
      if (config.templateId === 'NEW' && config.newTemplate.text) {
        console.log("Creando nueva plantilla de mensaje...");
        const templateData = {
          message_text: config.newTemplate.text,
          suggestions: config.newTemplate.response ? [{
            type: "TEXT",
            text: config.newTemplate.response,
            payload: "SUGGESTED_RESPONSE"
          }] : []
        };

        const tplRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${config.pageId}/message_templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: "Template_" + Date.now(),
            library_template_name: "greeting",
            template_type: "ICE_BREAKERS",
            data: templateData,
            access_token: token
          })
        });
        const tplData = await tplRes.json();
        if (tplData.id) {
          console.log(`Plantilla creada: ${tplData.id}`);
          if (finalMediaType === 'img') {
            cb.object_story_spec.link_data.message_template_id = tplData.id;
          } else if (finalMediaType === 'vid') {
            cb.object_story_spec.video_data.message_template_id = tplData.id;
          }
        } else {
          console.warn("Error creando plantilla:", tplData);
        }
      } else if (config.templateId && config.templateId !== 'NEW') {
        if (finalMediaType === 'img') {
          cb.object_story_spec.link_data.message_template_id = config.templateId;
        } else if (finalMediaType === 'vid') {
          cb.object_story_spec.video_data.message_template_id = config.templateId;
        }
      }

      console.log("Registrando AdCreative en Meta...");
      const ctr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adcreatives`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cb)
      });
      const ctrd = await ctr.json();
      if (!ctrd.id) throw new Error("Error creando creativo: " + (ctrd.error?.message || JSON.stringify(ctrd)));
      creativeId = ctrd.id;
      console.log(`AdCreative creado: ${creativeId}`);
    }

    if (config.adId !== "NEW") {
      console.log(`[Worker] Actualizando Anuncio existente: ${config.adId}`);
      const adr = await fetch(`https://graph.facebook.com/${API_VERSION}/${config.adId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.adName,
          creative: creativeId ? { creative_id: creativeId } : undefined,
          status: config.status,
          access_token: token
        })
      });
      const res = await adr.json();
      if (res.error) {
        console.error("Error Meta Ads (Update):", JSON.stringify(res.error));
        throw new Error("Error actualizando anuncio: " + (res.error.message || JSON.stringify(res.error)));
      }
      console.log(`Anuncio actualizado: ${config.adId}`);
      return new Response(JSON.stringify({ success: true, adId: config.adId }), { headers: { "Content-Type": "application/json" } });
    } else if (creativeId) {
      console.log("Creando el anuncio final...");
      const adr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/ads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.adName,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: config.status,
          degrees_of_freedom_spec: { multi_advertiser_ads_enabled: true },
          access_token: token
        })
      });
      const res = await adr.json();
      if (!res.id) {
        console.error("Error Meta Ads (Create):", JSON.stringify(res.error));
        throw new Error("Error creando anuncio: " + (res.error?.message || JSON.stringify(res.error)));
      }
      console.log(`Anuncio publicado exitosamente: ${res.id}`);
      return new Response(JSON.stringify({ success: true, adId: res.id }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, error: "No se pudo generar el creativo (mediaId faltante)" }), { status: 400 });
  } catch (e) {
    console.error("Error fatal en handleCreateAdvancedAd:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
}

// --- INTERFAZ VISUAL ---

function generateHTML(env) {
  const meta = env.META_ACCESS_TOKEN || "";
  const openai = env.OPENAI_API_KEY || "";
  const accId = env.AD_ACCOUNT_ID || "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Meta Expert</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .active-tab { background: #1e293b; color: #60a5fa; border-right: 4px solid #3b82f6; }
    .card { background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); padding: 1.5rem; }
    .loader-spin { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .step-num { position: absolute; left: -1rem; top: 1.5rem; width: 2rem; height: 2rem; background: #2563eb; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid white; z-index: 10; }
  </style>
</head>
<body class="bg-slate-50 flex h-screen overflow-hidden font-sans">
  <nav class="w-64 bg-[#0f172a] text-white flex flex-col justify-between py-8 shrink-0 relative z-20 shadow-xl">
    <div>
      <div class="px-8 mb-12 flex items-center gap-2">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black">M</div>
        <h1 class="text-xl font-black tracking-tighter uppercase">Meta Expert</h1>
      </div>
      <div class="space-y-1">
        <button id="nav-dash" onclick="tab('dash')" class="w-full px-8 py-3 flex items-center gap-3 text-slate-400 hover:bg-slate-800 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg> Reportes
        </button>
        <button id="nav-create" onclick="tab('create')" class="w-full px-8 py-3 flex items-center gap-3 active-tab transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg> Crear Anuncio
        </button>
        <button id="nav-config" onclick="tab('config')" class="w-full px-8 py-3 flex items-center gap-3 text-slate-400 hover:bg-slate-800 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> API Config
        </button>
      </div>
    </div>
    <div class="px-8 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cloudflare Worker Edition</div>
  </nav>

  <main class="flex-1 flex flex-col overflow-hidden relative z-10">
    <!-- TAB CREAR -->
    <div id="tab-create" class="flex-1 flex overflow-hidden p-8 gap-8">
      <div class="flex-1 overflow-y-auto space-y-6 pb-20 px-4">
        <div class="card relative">
          <div class="step-num">1</div>
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-800 mb-6">Campaña</h2>
          <div class="space-y-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Seleccionar Campaña</label>
              <select id="sel-camp" onchange="loadAdSets(this.value)" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                <option value="NEW">+ Crear Nueva Campaña</option>
              </select>
            </div>
            <div id="camp-new-config" class="space-y-4">
              <input type="text" id="cn" placeholder="Nombre de la Nueva Campaña..." class="w-full bg-slate-50 border rounded-lg p-3 outline-none text-lg focus:ring-2 ring-blue-500 font-medium text-slate-700">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Objetivo</label>
                  <select id="ob" class="w-full bg-slate-50 border rounded-lg p-3 outline-none font-bold text-slate-600 cursor-pointer">
                    <option value="OUTCOME_ENGAGEMENT">Interacción</option>
                    <option value="OUTCOME_SALES">Ventas</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tipo de Compra</label>
                  <input type="text" value="Subasta" readonly class="w-full bg-slate-100 border rounded-lg p-3 text-sm font-bold text-slate-500">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card relative">
          <div class="step-num">2</div>
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-800 mb-6">Conjunto de Anuncios</h2>
          <div class="space-y-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Seleccionar Conjunto</label>
              <select id="sel-adset" onchange="loadAds(this.value)" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                <option value="NEW">+ Crear Nuevo Conjunto</option>
              </select>
            </div>
            <div id="adset-new-config" class="space-y-4">
              <input type="text" id="asn" placeholder="Nombre del Nuevo Conjunto..." class="w-full bg-slate-50 border rounded-lg p-3 outline-none text-sm font-bold text-slate-700">

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estrategia Ciclo de Vida</label>
                  <input type="text" value="Captar nuevos clientes" readonly class="w-full bg-slate-100 border rounded-lg p-3 text-sm font-bold text-slate-500">
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ubicación Conversión</label>
                  <input type="text" value="Destinos mensajes" readonly class="w-full bg-slate-100 border rounded-lg p-3 text-sm font-bold text-slate-500">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Destinos de Mensajes</label>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="dest-msg" checked> Messenger</label>
                    <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="dest-ig" checked> Instagram</label>
                    <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="dest-wa" checked> WhatsApp</label>
                  </div>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Objetivo Rendimiento</label>
                  <input type="text" value="Maximizar conversaciones" readonly class="w-full bg-slate-100 border rounded-lg p-3 text-sm font-bold text-slate-500">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Presupuesto Diario (Q)</label>
                  <input type="number" id="ba" value="250" class="w-full bg-slate-50 border rounded-lg p-3 font-black text-blue-600">
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha de Inicio</label>
                  <input type="date" id="sd" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-[10px] font-bold text-slate-400 uppercase block">Público</label>
                <select id="sel-audience" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                  <option value="">+ Crear Público Manual</option>
                </select>
                <div id="manual-audience" class="space-y-4 border-t pt-4">
                  <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Lugares (Departamentos GT)</label>
                    <div id="dept-list" class="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border p-2 rounded"></div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Edad Mín</label><input type="number" id="ami" value="18" class="w-full bg-slate-50 border rounded-lg p-3 text-sm"></div>
                    <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Sugerir Público (Intereses)</label><input type="text" id="adsug" placeholder="Ej: Muebles, Decoración..." class="w-full bg-slate-50 border rounded-lg p-3 text-sm"></div>
                  </div>
                </div>
              </div>

              <div>
                <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Plataformas</label>
                <div class="flex flex-wrap gap-4 mt-2">
                  <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="plat-fb" checked> Facebook</label>
                  <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="plat-ig" checked> Instagram</label>
                  <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="plat-an" checked> Audience Network</label>
                  <label class="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" id="plat-msg" checked> Messenger</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card relative">
          <div class="step-num">3</div>
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-800 mb-6">Anuncio</h2>
          <div class="space-y-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Seleccionar Anuncio (Editar)</label>
              <select id="sel-ad" onchange="loadAdDetails(this.value)" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                <option value="NEW">+ Crear Nuevo Anuncio</option>
              </select>
            </div>
            <div id="ad-config" class="space-y-4">
              <input type="text" id="ad-name" placeholder="Nombre del Anuncio..." class="w-full bg-slate-50 border rounded-lg p-3 outline-none text-sm font-bold text-slate-700">

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Página de Facebook</label>
                  <select id="pgs" onchange="updatePageDetails(this.value)" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700"></select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Perfil de Instagram</label>
                  <select id="sel-ig" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700"></select>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Formato</label>
                  <select id="ad-format" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                    <option value="SINGLE_IMAGE_OR_VIDEO">Imagen o video único</option>
                    <option value="CAROUSEL">Secuencia</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Anuncios multianunciante</label>
                  <input type="text" value="Activado" readonly class="w-full bg-slate-100 border rounded-lg p-3 text-sm font-bold text-slate-500">
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-[10px] font-bold text-slate-400 uppercase block">Conversaciones (Plantilla)</label>
                <select id="sel-template" onchange="this.value === 'NEW' ? document.getElementById('new-template-config').classList.remove('hidden') : document.getElementById('new-template-config').classList.add('hidden')" class="w-full bg-slate-50 border rounded-lg p-3 text-sm font-bold text-slate-700">
                  <option value="NEW">+ Crear Nueva Plantilla</option>
                </select>
                <div id="new-template-config" class="space-y-4 border-t pt-4 hidden">
                  <input type="text" id="tpl-text" placeholder="Texto de bienvenida..." class="w-full bg-slate-50 border rounded-lg p-3 text-sm">
                  <input type="text" id="tpl-res" placeholder="Respuesta sugerida..." class="w-full bg-slate-50 border rounded-lg p-3 text-sm">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="w-80 flex flex-col gap-6 shrink-0">
        <div class="card flex-1 overflow-y-auto space-y-4 shadow-xl">
          <div id="dropzone" onclick="document.getElementById('fi').click()" class="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 cursor-pointer aspect-square bg-slate-50 group transition">
            <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            <span class="text-xs font-black uppercase">Sube Imagen o Video</span>
            <input type="file" id="fi" class="hidden" onchange="preview(this)">
          </div>
          <button onclick="suggestIA()" id="btn-ia" class="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-xl py-3 font-black shadow-lg uppercase text-[11px] tracking-widest">Sugerir con IA ✨</button>
          <textarea id="pt" placeholder="Texto Principal" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm h-32"></textarea>
          <input type="text" id="hd" placeholder="Título del Anuncio" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm font-medium">
          <select class="w-full bg-slate-100 border-none rounded-xl p-3 outline-none text-sm font-bold text-slate-600"><option>Enviar Mensaje</option></select>
        </div>
        <button onclick="go()" id="btn-go" class="w-full bg-blue-600 text-white rounded-2xl py-5 font-black text-lg shadow-xl shadow-blue-300 hover:bg-blue-700 transition uppercase tracking-widest">Lanzar Ahora</button>
      </div>
    </div>

    <!-- TAB DASHBOARD -->
    <div id="tab-dash" class="hidden flex-1 flex flex-col p-8 overflow-y-auto">
      <div class="max-w-6xl mx-auto w-full">
        <div class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-black text-slate-800 flex items-center gap-3"><div class="w-2 h-8 bg-blue-600 rounded-full"></div>Centro de Reportes</h1>
          <div class="flex gap-2 items-center">
            <input type="date" id="rep-start" class="bg-white border rounded-lg p-2 text-xs font-bold">
            <span class="text-slate-400">al</span>
            <input type="date" id="rep-end" class="bg-white border rounded-lg p-2 text-xs font-bold">
            <button onclick="loadDash()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-widest">Buscar</button>
          </div>
        </div>

        <div id="dash-content" class="space-y-4">
          <!-- Accordion content will go here -->
        </div>
      </div>
    </div>

    <!-- TAB CONFIG -->
    <div id="tab-config" class="hidden flex-1 flex flex-col p-8 overflow-y-auto">
      <div class="max-w-xl mx-auto w-full space-y-6">
        <h1 class="text-2xl font-black mb-8 text-slate-800">Configuración</h1>
        <div class="card space-y-4">
          <div><label class="text-[10px] font-black uppercase text-slate-400">Meta Token</label><input type="password" id="mt" placeholder="Token configurado en Environment..." class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <div><label class="text-[10px] font-black uppercase text-slate-400">OpenAI Key</label><input type="password" id="ok" placeholder="Key configurada en Environment..." class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <div><label class="text-[10px] font-black uppercase text-slate-400">Ad Account ID</label><input type="text" id="aa" placeholder="ID configurado en Environment..." class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <p class="text-[10px] text-slate-400 font-bold uppercase italic">Los valores se toman de las variables de entorno de Cloudflare para mayor seguridad.</p>
          <div class="flex gap-2">
            <button onclick="checkPerms()" class="flex-1 bg-blue-100 text-blue-700 py-4 rounded-xl font-black uppercase tracking-widest text-xs mt-4 border border-blue-200">Verificar Permisos</button>
            <button onclick="alert('Configuración guardada (Local). Use Cloudflare para cambios permanentes.')" class="flex-1 bg-slate-800 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs mt-4">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <div id="ldr" class="fixed inset-0 bg-[#0f172a]/90 backdrop-blur-md flex items-center justify-center hidden text-white flex-col gap-6 z-[100] transition duration-500">
    <div class="relative w-20 h-20">
      <div class="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
      <div class="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div class="text-center max-w-sm w-full px-4">
      <p class="font-black tracking-widest uppercase text-sm mb-2">Sincronizando con Meta...</p>
      <div id="ldr-log" class="bg-black/40 rounded-lg p-3 text-left font-mono text-[9px] h-32 overflow-y-auto space-y-1 border border-white/10"></div>
      <p id="ldr-msg" class="mt-2 text-[10px] font-bold text-blue-400 uppercase tracking-tighter opacity-70 animate-pulse">Iniciando proceso...</p>
    </div>
  </div>

  <script>
    let locs=[];
    const DEPTS_GT = ["Alta Verapaz", "Baja Verapaz", "Chimaltenango", "Chiquimula", "El Progreso", "Escuintla", "Guatemala", "Huehuetenango", "Izabal", "Jalapa", "Jutiapa", "Petén", "Quetzaltenango", "Quiché", "Retalhuleu", "Sacatepéquez", "San Marcos", "Santa Rosa", "Sololá", "Suchitepéquez", "Totonicapán", "Zacapa"];

    window.onload=async()=>{
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('rep-start').value = today;
      document.getElementById('rep-end').value = today;
      document.getElementById('sd').value = today;
      try {
        const r=await fetch('/api/get-accounts',{method:'POST'});
        const d=await r.json();
        const s=document.getElementById('pgs');
        s.innerHTML='<option value="">Página de Facebook...</option>';
        if(d.data) d.data.forEach(p=>s.add(new Option(p.name, p.id)));

    const [r2, r3] = await Promise.all([
      fetch('/api/get-active-campaigns',{method:'POST'}),
      fetch('/api/get-custom-audiences',{method:'POST'})
    ]);
        const d2=await r2.json();
    const d3=await r3.json();

        const sc=document.getElementById('sel-camp');
        if(d2.data) d2.data.forEach(c=>sc.add(new Option(c.name, c.id)));

        const sa=document.getElementById('sel-audience');
        if(d3.data) d3.data.forEach(a=>sa.add(new Option(a.name, a.id)));

        const dl = document.getElementById('dept-list');
        DEPTS_GT.forEach(dept => {
          const div = document.createElement('label');
          div.className = 'flex items-center gap-2 bg-slate-100 p-2 rounded cursor-pointer hover:bg-slate-200 transition';
          div.innerHTML = \`<input type="checkbox" value="\\\${dept}" class="dept-check"> <span class="text-[10px] font-bold">\\\${dept}</span>\`;
          dl.appendChild(div);
        });
      } catch(e){}
    };

    async function loadAdSets(campId){
      const s=document.getElementById('sel-adset');
      s.innerHTML='<option value="NEW">+ Crear Nuevo Conjunto</option>';
      const campConfig = document.getElementById('camp-new-config');
      if(campId === "NEW") {
        campConfig.classList.remove('hidden');
        return;
      }
      campConfig.classList.add('hidden');
      try {
        const r=await fetch('/api/get-adsets',{method:'POST',body:JSON.stringify({campaignId:campId})});
        const d=await r.json();
        if(d.data) d.data.forEach(as=>s.add(new Option(as.name, as.id)));
      } catch(e){}
    }

    async function loadAds(adsetId){
      const s=document.getElementById('sel-ad');
      s.innerHTML='<option value="NEW">+ Crear Nuevo Anuncio</option>';
      const adsetConfig = document.getElementById('adset-new-config');
      if(adsetId === "NEW") {
        adsetConfig.classList.remove('hidden');
        return;
      }
      adsetConfig.classList.add('hidden');
      try {
        const r=await fetch('/api/get-ads',{method:'POST',body:JSON.stringify({adsetId})});
        const d=await r.json();
        if(d.data) d.data.forEach(ad=>s.add(new Option(ad.name, ad.id)));
      } catch(e){}
    }

    async function loadAdDetails(adId){
      if(adId === "NEW") {
        // Reset fields if needed
        return;
      }
      try {
        const r = await fetch('/api/get-ad-details', {method:'POST', body:JSON.stringify({adId})});
        const d = await r.json();
        if(d.data) {
          // Fill fields for editing
          document.getElementById('ad-name').value = d.data.name;
          document.getElementById('pt').value = d.data.creative?.object_story_spec?.link_data?.message || d.data.creative?.object_story_spec?.video_data?.message || "";
          document.getElementById('hd').value = d.data.creative?.name || "";
        }
      } catch(e){}
    }

    async function updatePageDetails(pageId){
      if(!pageId) return;
      try {
        // Load IG Profiles
        const r1 = await fetch('/api/get-instagram-accounts', {method:'POST', body:JSON.stringify({pageId})});
        const d1 = await r1.json();
        const sig = document.getElementById('sel-ig');
        sig.innerHTML = '<option value="">Perfil de Instagram...</option>';
        if(d1.instagram_business_account) {
          sig.add(new Option(d1.instagram_business_account.name || "Instagram vinculado", d1.instagram_business_account.id));
        } else {
          sig.add(new Option("No hay cuenta de IG vinculada", ""));
        }

        // Load Templates
        const r2 = await fetch('/api/get-message-templates', {method:'POST', body:JSON.stringify({pageId})});
        const d2 = await r2.json();
        const st = document.getElementById('sel-template');
        st.innerHTML = '<option value="NEW">+ Crear Nueva Plantilla</option>';
        if(d2.data) d2.data.forEach(t=>st.add(new Option(t.name, t.id)));
      } catch(e){}
    }

    function tab(t){
      ['dash','create','config'].forEach(v=>{
        const el = document.getElementById('tab-'+v);
        if(el) el.classList.add('hidden');
        const nav = document.getElementById('nav-'+v);
        if(nav) nav.classList.remove('active-tab');
      });
      const target = document.getElementById('tab-'+t);
      if(target) target.classList.remove('hidden');
      const targetNav = document.getElementById('nav-'+t);
      if(targetNav) targetNav.classList.add('active-tab');
    }

    async function toggleStatus(id, currentStatus){
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      try {
        const r=await fetch('/api/update-status',{method:'POST',body:JSON.stringify({id, status:newStatus})});
        const d=await r.json();
        if(d.error) alert('Error: ' + d.error.message);
        loadDash();
      } catch(e){ alert('Error al cambiar estado'); }
    }

    async function loadDash(){
      document.getElementById('ldr').classList.remove('hidden');
      const start = document.getElementById('rep-start').value;
      const end = document.getElementById('rep-end').value;
      try {
        const r=await fetch('/api/get-full-report',{method:'POST',body:JSON.stringify({start, end})});
        const d=await r.json();
        if(d.error) { alert('Error: ' + d.error); return; }
        const container = document.getElementById('dash-content');
        container.innerHTML = '';

        d.data.forEach(camp => {
          const ins = camp.insights?.data?.[0] || { spend:0, impressions:0, reach:0, actions:[] };
          const msgs = ins.actions?.find(a => a.action_type === 'onsite_conversion.messaging_first_reply') || { value:0 };

          const campDiv = document.createElement('div');
          campDiv.className = 'bg-white rounded-xl shadow-sm border overflow-hidden mb-4';

          const header = document.createElement('div');
          header.className = 'p-4 bg-slate-50 flex justify-between items-center cursor-pointer hover:bg-slate-100';
          header.onclick = () => campDiv.querySelector('.adsets-container').classList.toggle('hidden');

          header.innerHTML = \`
            <div class="flex items-center gap-4">
              <div class="w-3 h-3 rounded-full \${camp.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
              <div>
                <p class="text-xs font-black uppercase text-slate-400">Campaña</p>
                <p class="font-bold text-slate-700">\${camp.name}</p>
              </div>
            </div>
            <div class="flex gap-8 text-right items-center">
              <div><p class="text-[10px] font-black text-slate-400 uppercase">Gasto</p><p class="font-bold text-slate-700">$\${parseFloat(ins.spend).toFixed(2)}</p></div>
              <div><p class="text-[10px] font-black text-slate-400 uppercase">Mensajes</p><p class="font-bold text-blue-600">\${msgs.value}</p></div>
              <div><p class="text-[10px] font-black text-slate-400 uppercase">Imp</p><p class="font-bold text-slate-700">\${ins.impressions}</p></div>
              <div><p class="text-[10px] font-black text-slate-400 uppercase">Alcance</p><p class="font-bold text-slate-700">\${ins.reach}</p></div>
              <button onclick="event.stopPropagation(); toggleStatus('\${camp.id}', '\${camp.status}')" class="px-4 py-2 \${camp.status === 'ACTIVE' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'} rounded-lg text-[10px] font-black uppercase">\${camp.status === 'ACTIVE' ? 'Pausar' : 'Activar'}</button>
            </div>
          \`;

          const adsetsContainer = document.createElement('div');
          adsetsContainer.className = 'adsets-container hidden border-t';

          camp.adsets.forEach(as => {
            const ains = as.insights?.data?.[0] || { spend:0, impressions:0, reach:0, actions:[] };
            const amsgs = ains.actions?.find(a => a.action_type === 'onsite_conversion.messaging_first_reply') || { value:0 };

            const asDiv = document.createElement('div');
            asDiv.className = 'p-4 border-b ml-8 bg-white';
            asDiv.innerHTML = \`
              <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full \${as.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
                  <p class="text-sm font-bold text-slate-600">AS: \${as.name}</p>
                </div>
                <div class="flex gap-6 text-right items-center">
                  <span class="text-[10px] font-bold text-slate-500">$\${parseFloat(ains.spend).toFixed(2)} | \${amsgs.value} MSGs | \${ains.impressions} Imp | \${ains.reach} Alcance</span>
                  <button onclick="toggleStatus('\${as.id}', '\${as.status}')" class="text-[10px] font-black uppercase \${as.status === 'ACTIVE' ? 'text-red-500' : 'text-emerald-500'}">\${as.status === 'ACTIVE' ? 'OFF' : 'ON'}</button>
                </div>
              </div>
            \`;

            const adsGrid = document.createElement('div');
            adsGrid.className = 'grid grid-cols-1 gap-2';

            as.ads.forEach(ad => {
              const adins = ad.insights?.data?.[0] || { spend:0, impressions:0, reach:0, actions:[] };
              const admsgs = adins.actions?.find(a => a.action_type === 'onsite_conversion.messaging_first_reply') || { value:0 };

              const adDiv = document.createElement('div');
              adDiv.className = 'flex items-center justify-between bg-slate-50 p-2 rounded-lg ml-4';
              adDiv.innerHTML = \`
                <div class="flex items-center gap-3">
                  <img src="\${ad.creative?.thumbnail_url || ''}" class="w-10 h-10 rounded bg-slate-200 object-cover">
                  <div>
                    <p class="text-[10px] font-bold text-slate-700">\${ad.name}</p>
                    <div class="flex items-center gap-2">
                      <div class="w-1.5 h-1.5 rounded-full \${ad.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
                      <span class="text-[9px] font-bold text-slate-400 uppercase">\${ad.status}</span>
                    </div>
                  </div>
                </div>
                <div class="flex gap-4 text-right items-center">
                  <div class="text-[10px] font-bold text-slate-500">
                    <p>$\${parseFloat(adins.spend).toFixed(2)} | \${adins.impressions} Imp | \${adins.reach} Alc</p>
                    <p class="text-blue-500">\${admsgs.value} MSGs</p>
                  </div>
                  <button onclick="toggleStatus('\${ad.id}', '\${ad.status}')" class="p-1 \${ad.status === 'ACTIVE' ? 'text-red-500' : 'text-emerald-500'} hover:bg-white rounded transition">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                  </button>
                </div>
              \`;
              adsGrid.appendChild(adDiv);
            });

            asDiv.appendChild(adsGrid);
            adsetsContainer.appendChild(asDiv);
          });

          campDiv.appendChild(header);
          campDiv.appendChild(adsetsContainer);
          container.appendChild(campDiv);
        });
      } catch(e){} finally { document.getElementById('ldr').classList.add('hidden'); }
    }

    async function srch(t,id){ const q=document.getElementById(id).value; try { const r=await fetch('/api/search',{method:'POST',body:JSON.stringify({type:t,q})}); const d=await r.json(); if(d.data?.length){ const it=d.data[0]; if(t==='adgeolocation'){ locs.push(it); document.getElementById('lsel').innerHTML+='<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase animate-bounce border border-blue-200">'+it.name+'</span>'; } } } catch(e){} }
    function preview(input){ if(input.files && input.files[0]){ const reader=new FileReader(); reader.onload=e=>document.getElementById('dropzone').innerHTML='<img src="'+e.target.result+'" class="max-h-full rounded-xl shadow-lg border-2 border-white">'; reader.readAsDataURL(input.files[0]); } }

    async function suggestIA(){
      const pt=document.getElementById('pt');
      const hd=document.getElementById('hd');
      const btn=document.getElementById('btn-ia');
      const old=btn.innerHTML;
      btn.innerHTML='<div class="loader-spin mx-auto"></div>';
      try {
        const file = document.getElementById('fi').files[0];
        let base64Image = null;
        if (file && file.type.startsWith('image/')) {
          base64Image = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
        }

        const r=await fetch('/api/openai-generate',{
          method:'POST',
          body:JSON.stringify({
            prompt: 'Genera un anuncio de Facebook Ads (Copywriting experto) para el producto: ' + document.getElementById('cn').value + '. Si hay una imagen, analízala para resaltar sus características.',
            image: base64Image
          })
        });
        const d=await r.json();
        if (d.error) throw new Error(d.error);
        if (!d.choices || !d.choices[0]) throw new Error('No se recibió respuesta de la IA');

        const aiResponse = d.choices[0].message.content.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim();
        const res = JSON.parse(aiResponse);
        pt.value=res.texto || res.text;
        hd.value=res.titulo || res.headline;
      } catch(e){
        console.error(e);
        pt.value='Error al generar sugerencia. Intente de nuevo.';
      } finally {
        btn.innerHTML=old;
      }
    }

    function setLdr(msg){
      document.getElementById('ldr-msg').innerText = msg;
      const log = document.getElementById('ldr-log');
      const entry = document.createElement('div');
      entry.className = msg.includes('Error') ? 'text-red-400' : 'text-slate-300';
      entry.innerHTML = \`<span class="text-white/30 mr-1">\${new Date().toLocaleTimeString()}</span> \${msg}\`;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

    async function checkPerms(){
      const ldr = document.getElementById('ldr');
      ldr.classList.remove('hidden');
      setLdr('Analizando Token y Cuenta...');

      try {
        const [r1, r2] = await Promise.all([
          fetch('/api/check-permissions', {method:'POST'}),
          fetch('/api/debug-token', {method:'POST'})
        ]);
        const d1 = await r1.json();
        const d2 = await r2.json();

        let report = "--- REPORTE DE SALUD ---\\n\\n";

        if(d1.token) report += \`TOKEN: \${d1.token.status.toUpperCase()} - \${d1.token.message}\\n\`;
        if(d1.account) report += \`CUENTA: \${d1.account.status.toUpperCase()} - \${d1.account.message}\\n\`;

        if(d2.data) {
          const expires = d2.data.expires_at ? new Date(d2.data.expires_at * 1000).toLocaleString() : "Nunca";
          report += \`EXPIRA: \${expires}\\n\`;
          report += \`TIPO: \${d2.data.type}\\n\`;
        }

        ldr.classList.add('hidden');
        alert(report);
      } catch(e) {
        ldr.classList.add('hidden');
        alert('Error en verificación: ' + e.message);
      }
    }

    async function go(){
      const isNewAd = document.getElementById('sel-ad').value === 'NEW';
      const f=document.getElementById('fi').files[0];
      const pageId = document.getElementById('pgs').value;

      if(isNewAd && !f) { alert('Debe subir una imagen o video para un anuncio nuevo.'); return; }
      if(!pageId) { alert('Seleccione una página emisora.'); return; }

      const ldr = document.getElementById('ldr');
      const log = document.getElementById('ldr-log');
      log.innerHTML = '';
      ldr.classList.remove('hidden');

      setLdr('Verificando acceso a Meta...');
      try {
        const vr = await fetch('/api/check-permissions', {method:'POST'});
        const vd = await vr.json();
        if(vd.token?.status === 'error') throw new Error('Token inválido: ' + vd.token.message);
        setLdr('Acceso validado correctamente.');
        if(vd.account?.status === 'error') {
          setLdr('Aviso de Cuenta: ' + vd.account.message);
          if(!confirm('Aviso de Cuenta: ' + vd.account.message + '\\n¿Desea intentar publicar de todos modos?')) {
            ldr.classList.add('hidden');
            return;
          }
        }
      } catch(e) {
        setLdr('Error de validación: ' + e.message);
        setTimeout(() => ldr.classList.add('hidden'), 3000);
        return;
      }

      let resolvedRegions = [];
      const depts = Array.from(document.querySelectorAll('.dept-check:checked')).map(c => c.value);
      if(depts.length > 0) {
        setLdr(\`Resolviendo \${depts.length} ubicaciones en Meta...\`);
        try {
          const rr = await fetch('/api/resolve-regions', {method:'POST', body:JSON.stringify({depts})});
          const rd = await rr.json();
          resolvedRegions = rd.regions || [];
          setLdr(\`Ubicaciones resueltas: \${resolvedRegions.length}\`);
        } catch(e) {
          setLdr('Error resolviendo ubicaciones: ' + e.message);
        }
      }

      let mediaId = null, mediaType = null;
      if(f) {
        setLdr(\`Subiendo \${f.name} (\\\\\\\${(f.size/1024/1024).toFixed(2)}MB)...\`);
        try {
          const mfd = new FormData();
          mfd.append('file', f);
          const mr = await fetch('/api/upload-media', {method:'POST', body:mfd});
          const md = await mr.json();
          if(md.error) throw new Error(md.error);
          mediaId = md.id;
          mediaType = md.type;
          setLdr(\`Archivo subido exitosamente ID: \${mediaId}\`);
        } catch(e) {
          setLdr('Error subiendo archivo: ' + e.message);
          setTimeout(() => ldr.classList.add('hidden'), 5000);
          return;
        }
      }

      setLdr('Publicando anuncio final en Meta...');
      const depts_selected = Array.from(document.querySelectorAll('.dept-check:checked')).map(c => c.value);
      const config={
        mediaId, mediaType, resolvedRegions,
        campaignId:document.getElementById('sel-camp').value,
        campaignName:document.getElementById('cn').value,
        objective:document.getElementById('ob').value,

        adSetId:document.getElementById('sel-adset').value,
        adSetName:document.getElementById('asn').value,
        budgetAmount:document.getElementById('ba').value,
        startDate:document.getElementById('sd').value,
        messagingDestinations: {
          messenger: document.getElementById('dest-msg').checked,
          instagram: document.getElementById('dest-ig').checked,
          whatsapp: document.getElementById('dest-wa').checked
        },
        audienceId: document.getElementById('sel-audience').value,
        manualAudience: {
          depts: depts_selected,
          ageMin: document.getElementById('ami').value,
          interests: document.getElementById('adsug').value
        },
        platforms: {
          facebook: document.getElementById('plat-fb').checked,
          instagram: document.getElementById('plat-ig').checked,
          audience_network: document.getElementById('plat-an').checked,
          messenger: document.getElementById('plat-msg').checked
        },

        adId: document.getElementById('sel-ad').value,
        adName: document.getElementById('ad-name').value,
        pageId: document.getElementById('pgs').value,
        instagramId: document.getElementById('sel-ig').value,
        format: document.getElementById('ad-format').value,
        templateId: document.getElementById('sel-template').value,
        newTemplate: {
          text: document.getElementById('tpl-text').value,
          response: document.getElementById('tpl-res').value
        },
        primaryText:document.getElementById('pt').value,
        headline:document.getElementById('hd').value || document.getElementById('ad-name').value,
        status:'PAUSED'
      };
      try {
        const r=await fetch('/api/create-advanced-ad',{
          method:'POST',
          headers: {'Content-Type': 'application/json'},
          body:JSON.stringify({config})
        });
        const res=await r.json();
        if(res.success){
          setLdr('¡ÉXITO! Operación completada.');
          setTimeout(() => {
            ldr.classList.add('hidden');
            alert('¡ÉXITO! Campaña/Anuncio listo. ID: ' + res.adId);
            tab('dash');
            loadDash();
          }, 1500);
        } else {
          setLdr('Error Meta: ' + res.error);
          setTimeout(() => ldr.classList.add('hidden'), 5000);
          alert('ERROR: ' + res.error);
        }
      } catch(e){ alert('Error fatal'); } finally { document.getElementById('ldr').classList.add('hidden'); }
    }
  </script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// --- EXPORT FINAL ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET") return generateHTML(env);
    if (request.method === "POST") {
      if (url.pathname === "/api/get-accounts") return await handleGetAccounts(env);
      if (url.pathname === "/api/search") {
        const b = await request.json();
        return await handleMetaSearch(b, env);
      }
      if (url.pathname === "/api/openai-generate") {
        const b = await request.json();
        return await handleOpenAIGenerate(b, env);
      }
      if (url.pathname === "/api/get-insights") {
        const b = await request.json();
        return await handleGetInsights(b, env);
      }
      if (url.pathname === "/api/get-active-campaigns") return await handleGetActiveCampaigns(env);
      if (url.pathname === "/api/get-adsets") {
        const b = await request.json();
        return await handleGetAdSets(b, env);
      }
      if (url.pathname === "/api/get-ads") {
        const b = await request.json();
        return await handleGetAds(b, env);
      }
      if (url.pathname === "/api/get-custom-audiences") return await handleGetCustomAudiences(env);
      if (url.pathname === "/api/get-instagram-accounts") {
        const b = await request.json();
        return await handleGetInstagramAccounts(b, env);
      }
      if (url.pathname === "/api/get-message-templates") {
        const b = await request.json();
        return await handleGetMessageTemplates(b, env);
      }
      if (url.pathname === "/api/check-permissions") return await handleCheckPermissions(env);
      if (url.pathname === "/api/debug-token") return await handleGetTokenInfo(env);
      if (url.pathname === "/api/update-status") {
        const b = await request.json();
        return await handleUpdateStatus(b, env);
      }
      if (url.pathname === "/api/get-full-report") {
        const b = await request.json();
        return await handleGetFullReport(b, env);
      }
      if (url.pathname === "/api/get-ad-details") {
        const b = await request.json();
        const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${b.adId}?fields=name,status,creative{id,name,object_story_spec}&access_token=${env.META_ACCESS_TOKEN}`);
        const d = await r.json();
        return new Response(JSON.stringify({ data: d }), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/resolve-regions") return await handleResolveRegions(await request.json(), env);
      if (url.pathname === "/api/upload-media") return await handleUploadMedia(await request.formData(), env);
      if (url.pathname === "/api/create-advanced-ad") return await handleCreateAdvancedAd(await request.json(), env);
    }
    return new Response("Not Found", { status: 404 });
  }
};
