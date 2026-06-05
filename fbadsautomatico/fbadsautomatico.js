/**
 * META EXPERT - LANZADOR DE PUBLICIDAD INTEGRADO (CLOUDFLARE WORKER)
 * Versión Unificada: Interfaz Visual + Lógica de Automatización
 */

const API_VERSION = "v19.0";
const FIXED_TEXT = "📲 ¡Escríbenos ahora y recibe tu cotización con promoción especial!\\n📦 Entregas a todo el país\\n💯 Garantía asegurada";

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
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Eres un experto en Copywriting para Facebook Ads. Responde siempre en formato JSON con llaves 'texto' y 'titulo'." },
        { role: "user", content: body.prompt }
      ]
    })
  });
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetInsights(body, env) {
  const accId = body.id || env.AD_ACCOUNT_ID;
  const url = `https://graph.facebook.com/${API_VERSION}/${accId}/insights?level=${body.level}&date_preset=${body.range}&fields=spend,clicks,impressions,reach&access_token=${env.META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleGetActiveCampaigns(env) {
  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${env.AD_ACCOUNT_ID}/campaigns?fields=name,status,objective&access_token=${env.META_ACCESS_TOKEN}&limit=20`);
  const d = await r.json();
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } });
}

async function handleCreateAdvancedAd(formData, env) {
  const file = formData.get('file');
  const config = JSON.parse(formData.get('config'));
  const token = env.META_ACCESS_TOKEN;
  const acc = env.AD_ACCOUNT_ID;

  try {
    // 1. Subir Media (Imagen o Video)
    let mediaId, mediaType;
    if (file && file.size > 0) {
      const ifd = new FormData();
      ifd.append('access_token', token);
      if (file.type.startsWith('image')) {
        ifd.append('bytes', file);
        const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adimages`, { method: 'POST', body: ifd });
        const d = await r.json();
        mediaId = Object.values(d.images)[0].hash;
        mediaType = 'img';
      } else {
        ifd.append('source', file);
        const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/advideos`, { method: 'POST', body: ifd });
        const d = await r.json();
        mediaId = d.id;
        mediaType = 'vid';
      }
    }

    // 2. Crear Campaña (Usa tu prefijo R1.5)
    const cr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/campaigns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `R1.5 ${config.campaignName}`,
        objective: config.objective,
        status: config.status,
        access_token: token
      })
    });
    const cd = await cr.json();
    const campaignId = cd.id;

    // 3. Crear Conjunto de Anuncios (Usa prefijo FB.R1.5.)
    const asb = {
      name: `FB.R1.5. ${config.campaignName}`,
      campaign_id: campaignId,
      optimization_goal: 'IMPRESSIONS',
      billing_event: 'IMPRESSIONS',
      targeting: {
        geo_locations: config.geoLocations,
        age_min: parseInt(config.ageMin),
        age_max: parseInt(config.ageMax),
        genders: config.genders,
        flexible_spec: config.interests?.length ? [{ interests: config.interests }] : []
      },
      status: config.status,
      access_token: token
    };
    if (config.budgetType === 'DAILY') asb.daily_budget = config.budgetAmount * 100;
    else asb.lifetime_budget = config.budgetAmount * 100;

    if (config.objective === 'OUTCOME_MESSAGING') {
      asb.promoted_object = { page_id: config.pageId };
      asb.destination_type = ['WHATSAPP_MESSAGE'];
    }

    const asr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adsets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asb)
    });
    const adSetId = (await asr.json()).id;

    // 4. Crear Creativo y Anuncio Final ([Code].C.[Price])
    let creativeId;
    if (mediaId) {
      const cb = {
        name: "Creative " + Date.now(),
        object_story_spec: { page_id: config.pageId },
        access_token: token
      };
      const finalMsg = `${config.primaryText}\\n\\n${FIXED_TEXT}`;

      if (mediaType === 'img') {
        cb.object_story_spec.link_data = {
          image_hash: mediaId,
          message: finalMsg,
          name: config.headline,
          call_to_action: { type: 'MESSAGE_PAGE' },
          link: `https://facebook.com/${config.pageId}`
        };
      } else {
        cb.object_story_spec.video_data = {
          video_id: mediaId,
          message: finalMsg,
          call_to_action: { type: 'MESSAGE_PAGE', value: { link: `https://facebook.com/${config.pageId}` } }
        };
      }

      const ctr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/adcreatives`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cb)
      });
      creativeId = (await ctr.json()).id;
    }

    if (creativeId) {
      const adr = await fetch(`https://graph.facebook.com/${API_VERSION}/${acc}/ads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${config.campaignName}.C.${config.budgetAmount}`,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: config.status,
          access_token: token
        })
      });
      const res = await adr.json();
      return new Response(JSON.stringify({ success: true, adId: res.id }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, error: "Error al generar el anuncio" }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
}

// --- INTERFAZ VISUAL ---

function generateHTML(env) {
  const meta = env.META_ACCESS_TOKEN || "";
  const openai = env.OPENAI_API_KEY || "";
  const accId = env.AD_ACCOUNT_ID || "";

  return new Response(`
<!DOCTYPE html>
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
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> API Config
        </button>
      </div>
    </div>
    <div class="px-8 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cloudflare Worker Edition</div>
  </nav>

  <main class="flex-1 flex flex-col overflow-hidden relative z-10">
    <!-- TAB CREAR -->
    <div id="tab-create" class="flex-1 flex overflow-hidden p-8 gap-8">
      <div class="flex-1 overflow-y-auto space-y-6 pb-20 pr-4">
        <div class="flex gap-4">
          <input type="text" id="cn" placeholder="Nombre del Producto..." class="flex-1 card py-4 border-none text-lg focus:ring-2 ring-blue-500 outline-none font-medium text-slate-700">
          <select id="ob" class="card py-4 border-none outline-none font-bold text-slate-600 cursor-pointer">
            <option value="OUTCOME_MESSAGING">Mensajes (WS/IG)</option>
            <option value="OUTCOME_TRAFFIC">Tráfico</option>
          </select>
        </div>

        <div class="card relative">
          <div class="absolute -left-3 top-6 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white">2</div>
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-800 mb-6">Segmentación</h2>
          <div class="space-y-6">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Lugares</label>
              <div class="flex gap-2">
                <input type="text" id="ls" placeholder="Ej: Guatemala..." class="flex-1 bg-slate-50 border rounded-lg p-3 outline-none text-sm">
                <button onclick="srch('adgeolocation','ls')" class="px-8 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition text-sm">Buscar</button>
              </div>
              <div id="lsel" class="mt-2 text-xs flex flex-wrap gap-1"></div>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Edad Mín</label><input type="number" id="ami" value="18" class="w-full bg-slate-50 border rounded-lg p-3 text-sm"></div>
              <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Edad Máx</label><input type="number" id="ama" value="65" class="w-full bg-slate-50 border rounded-lg p-3 text-sm"></div>
              <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Género</label><select id="gn" class="w-full bg-slate-50 border rounded-lg p-3 text-sm"><option value="[1,2]">Todos</option><option value="[1]">Hombres</option><option value="[2]">Mujeres</option></select></div>
            </div>
          </div>
        </div>

        <div class="card relative">
          <div class="absolute -left-3 top-6 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white">3</div>
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-800 mb-6">Presupuesto</h2>
          <div class="grid grid-cols-2 gap-6">
            <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tipo</label><select id="bt" class="w-full bg-slate-50 border rounded-lg p-3 font-bold text-sm"><option value="DAILY">Diario</option><option value="LIFETIME">Total</option></select></div>
            <div><label class="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Monto (Q)</label><input type="number" id="ba" value="250" class="w-full bg-slate-50 border rounded-lg p-3 font-black text-blue-600"></div>
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
          <select id="pgs" class="w-full bg-slate-100 border-none rounded-lg p-3 outline-none text-sm font-bold text-slate-700"></select>
          <button onclick="suggestIA()" id="btn-ia" class="w-full bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-xl py-3 font-black shadow-lg uppercase text-[11px] tracking-widest">Sugerir con IA ✨</button>
          <textarea id="pt" placeholder="Texto Principal" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm h-32"></textarea>
          <input type="text" id="hd" placeholder="Título del Anuncio" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm font-medium">
          <select class="w-full bg-slate-100 border-none rounded-xl p-3 outline-none text-sm font-bold text-slate-600"><option>Enviar Mensaje</option></select>
        </div>
        <button onclick="go()" id="btn-go" class="w-full bg-blue-600 text-white rounded-2xl py-5 font-black text-lg shadow-xl shadow-blue-300 hover:bg-blue-700 transition uppercase tracking-widest">Lanzar Ahora</button>
      </div>
    </div>

    <!-- TAB DASHBOARD -->
    <div id="tab-dash" class="hidden flex-1 p-8 overflow-y-auto">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-2xl font-black mb-8 text-slate-800 flex items-center gap-3"><div class="w-2 h-8 bg-blue-600 rounded-full"></div>Centro de Reportes</h1>
        <div class="grid grid-cols-4 gap-6 mb-12">
          <div class="card border-l-4 border-blue-500 flex flex-col justify-between h-32"><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gasto Total</p><p class="text-3xl font-black text-slate-700" id="d-spend">$0.00</p></div>
          <div class="card border-l-4 border-indigo-500 flex flex-col justify-between h-32"><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clics</p><p class="text-3xl font-black text-slate-700" id="d-cli">0</p></div>
          <div class="card border-l-4 border-purple-500 flex flex-col justify-between h-32"><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impresiones</p><p class="text-3xl font-black text-slate-700" id="d-imp">0</p></div>
          <div class="card border-l-4 border-emerald-500 flex flex-col justify-between h-32"><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alcance</p><p class="text-3xl font-black text-slate-700" id="d-rea">0</p></div>
        </div>
        <div class="card overflow-hidden p-0"><table class="w-full text-left text-sm font-bold text-slate-600 divide-y"><thead class="bg-slate-50 text-[10px] uppercase font-black"><tr class="border-b"><th class="p-6">Campaña</th><th class="p-6">Estado</th><th class="p-6 text-right">Gasto</th></tr></thead><tbody id="dash-list"></tbody></table></div>
      </div>
    </div>

    <!-- TAB CONFIG -->
    <div id="tab-config" class="hidden flex-1 p-8 overflow-y-auto">
      <div class="max-w-xl mx-auto space-y-6">
        <h1 class="text-2xl font-black mb-8 text-slate-800">Configuración</h1>
        <div class="card space-y-4">
          <div><label class="text-[10px] font-black uppercase text-slate-400">Meta Token</label><input type="password" id="mt" value="${meta}" class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <div><label class="text-[10px] font-black uppercase text-slate-400">OpenAI Key</label><input type="password" id="ok" value="${openai}" class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <div><label class="text-[10px] font-black uppercase text-slate-400">Ad Account ID</label><input type="text" id="aa" value="${accId}" class="w-full border p-3 rounded-lg bg-slate-50"></div>
          <button class="w-full bg-slate-800 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs mt-4">Guardar</button>
        </div>
      </div>
    </div>
  </main>

  <div id="ldr" class="fixed inset-0 bg-[#0f172a]/90 backdrop-blur-md flex items-center justify-center hidden text-white flex-col gap-6 z-[100] transition duration-500">
    <div class="relative w-20 h-20">
      <div class="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
      <div class="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <p class="font-black tracking-widest uppercase text-sm">Sincronizando con Meta...</p>
  </div>

  <script>
    let locs=[];
    window.onload=async()=>{ try { const r=await fetch('/api/get-accounts',{method:'POST'}); const d=await r.json(); const s=document.getElementById('pgs'); s.innerHTML='<option value="">Página Emisora...</option>'; if(d.data) d.data.forEach(p=>s.add(new Option(p.name, p.id))); } catch(e){} };
    function tab(t){ ['dash','create','config'].forEach(v=>{ document.getElementById('tab-'+v).classList.add('hidden'); document.getElementById('nav-'+v).classList.remove('active-tab'); }); document.getElementById('tab-'+t).classList.remove('hidden'); document.getElementById('nav-'+t).classList.add('active-tab'); if(t==='dash') loadDash(); }
    async function loadDash(){ const aa=document.getElementById('aa').value; try { const r=await fetch('/api/get-insights',{method:'POST',body:JSON.stringify({id:aa,level:'account',range:'today'})}); const d=await r.json(); if(d.data?.length){ const i=d.data[0]; document.getElementById('d-spend').innerText='$'+parseFloat(i.spend).toFixed(2); document.getElementById('d-cli').innerText=i.clicks || 0; document.getElementById('d-imp').innerText=i.impressions || 0; document.getElementById('d-rea').innerText=i.reach || 0; } const r2=await fetch('/api/get-active-campaigns',{method:'POST'}); const d2=await r2.json(); document.getElementById('dash-list').innerHTML=d2.data?.map(c=>'<tr class="hover:bg-slate-50 transition"><td class="p-6">'+c.name+'</td><td class="p-6"><span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-tighter">'+c.status+'</span></td><td class="p-6 text-right font-black">-</td></tr>').join('') || ''; } catch(e){} }
    async function srch(t,id){ const q=document.getElementById(id).value; try { const r=await fetch('/api/search',{method:'POST',body:JSON.stringify({type:t,q})}); const d=await r.json(); if(d.data?.length){ const it=d.data[0]; if(t==='adgeolocation'){ locs.push(it); document.getElementById('lsel').innerHTML+='<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase animate-bounce border border-blue-200">'+it.name+'</span>'; } } } catch(e){} }
    function preview(input){ if(input.files && input.files[0]){ const reader=new FileReader(); reader.onload=e=>document.getElementById('dropzone').innerHTML='<img src="'+e.target.result+'" class="max-h-full rounded-xl shadow-lg border-2 border-white">'; reader.readAsDataURL(input.files[0]); } }
    async function suggestIA(){ const pt=document.getElementById('pt'); const hd=document.getElementById('hd'); const btn=document.getElementById('btn-ia'); const old=btn.innerHTML; btn.innerHTML='<div class="loader-spin mx-auto"></div>'; try { const r=await fetch('/api/openai-generate',{method:'POST',body:JSON.stringify({prompt:'Genera anuncio corto para vender '+document.getElementById('cn').value})}); const d=await r.json(); const res=JSON.parse(d.choices[0].message.content.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim()); pt.value=res.texto; hd.value=res.titulo; } catch(e){ pt.value='Error'; } finally { btn.innerHTML=old; } }
    async function go(){ document.getElementById('ldr').classList.remove('hidden'); const fd=new FormData(); const f=document.getElementById('fi').files[0]; if(f) fd.append('file',f); const config={campaignName:document.getElementById('cn').value,objective:document.getElementById('ob').value,budgetType:document.getElementById('bt').value,budgetAmount:document.getElementById('ba').value,ageMin:document.getElementById('ami').value,ageMax:document.getElementById('ama').value,genders:JSON.parse(document.getElementById('gn').value),geoLocations:locs.length?{regions:locs.map(l=>({key:l.key}))}:{countries:['GT']},primaryText:document.getElementById('pt').value,headline:document.getElementById('hd').value,status:'PAUSED',pageId:document.getElementById('pgs').value}; fd.append('config',JSON.stringify(config)); try { const r=await fetch('/api/create-advanced-ad',{method:'POST',body:fd}); const res=await r.json(); if(res.success){ alert('¡ÉXITO! Campaña lanzada (Pausada para revisión). ID: '+res.adId); tab('dash'); } else { alert('ERROR: '+res.error); } } catch(e){ alert('Error fatal'); } finally { document.getElementById('ldr').classList.add('hidden'); } }
  </script>
</body>
</html>
  `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// --- EXPORT FINAL ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET") return generateHTML(env);
    if (request.method === "POST") {
      const b = await request.clone().json().catch(()=>({}));
      if (url.pathname === "/api/get-accounts") return await handleGetAccounts(env);
      if (url.pathname === "/api/search") return await handleMetaSearch(b, env);
      if (url.pathname === "/api/openai-generate") return await handleOpenAIGenerate(b, env);
      if (url.pathname === "/api/get-insights") return await handleGetInsights(b, env);
      if (url.pathname === "/api/get-active-campaigns") return await handleGetActiveCampaigns(env);
      if (url.pathname === "/api/create-advanced-ad") return await handleCreateAdvancedAd(await request.formData(), env);
    }
    return new Response("Not Found", { status: 404 });
  }
};
