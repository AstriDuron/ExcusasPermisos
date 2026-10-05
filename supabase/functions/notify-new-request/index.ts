import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const [hours = '00', minutes = '00'] = value.split(':');
  return new Intl.DateTimeFormat('es-HN', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(`2026-01-01T${hours}:${minutes}:00`));
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseEmailList(value?: string | null) {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email, name: 'Administrador' }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'Instituto Técnico Regional Minas de Oro';
  const recipientEmails = parseEmailList(Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'nahum.duron@educatrachos.edu.hn');
  const ccEmails = parseEmailList(Deno.env.get('ADMIN_NOTIFICATION_CC'));
  const appUrl = Deno.env.get('APP_URL') || 'https://excusas-permisos-minas-dusky.vercel.app';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !brevoApiKey || !senderEmail || recipientEmails.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing notification secrets' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');

  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { requestId } = await request.json();
  if (!requestId) {
    return new Response(JSON.stringify({ error: 'Missing request id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: requestRow, error: requestError } = await adminClient
    .from('requests')
    .select('id, request_code, user_id, type, category, start_date, end_date, schedule, class_hours, reason, profiles:user_id(email, full_name, department)')
    .eq('id', requestId)
    .single();

  if (requestError || !requestRow) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: actorProfile } = await adminClient
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single();

  const isOwner = requestRow.user_id === userData.user.id;
  const isAdmin = actorProfile?.role === 'admin' && actorProfile?.active === true;

  if (!isOwner && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const typeLabel = requestRow.type === 'permiso' ? 'Permiso' : 'Excusa';
  const personName = requestRow.profiles?.full_name || requestRow.profiles?.email || 'Personal';
  const personEmail = requestRow.profiles?.email || '';
  const period = requestRow.start_date === requestRow.end_date
    ? formatDate(requestRow.start_date)
    : `${formatDate(requestRow.start_date)} - ${formatDate(requestRow.end_date)}`;

  const subject = `Nueva solicitud ${requestRow.request_code}: ${typeLabel}`;
  const textContent = [
    'Revisa tu bandeja de solicitudes.',
    '',
    `Código: ${requestRow.request_code}`,
    `Tipo: ${typeLabel}`,
    `Categoría: ${requestRow.category}`,
    `Personal: ${personName}`,
    `Correo: ${personEmail}`,
    `Periodo: ${period}`,
    `Jornada: ${requestRow.schedule}`,
    `Horas clase: ${requestRow.class_hours}`,
    '',
    `Motivo: ${requestRow.reason}`,
    '',
    `Abrir app: ${appUrl}`
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #101828; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Nueva solicitud registrada</h2>
      <p>Revisa tu bandeja de solicitudes en la app.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 620px;">
        <tr><td style="padding: 6px 0; color: #667085;">Código</td><td><strong>${escapeHtml(requestRow.request_code)}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Tipo</td><td>${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Categoría</td><td>${escapeHtml(requestRow.category)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Personal</td><td>${escapeHtml(personName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Correo</td><td>${escapeHtml(personEmail)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Periodo</td><td>${escapeHtml(period)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Jornada</td><td>${escapeHtml(requestRow.schedule)}</td></tr>
        <tr><td style="padding: 6px 0; color: #667085;">Horas clase</td><td>${escapeHtml(requestRow.class_hours)}</td></tr>
      </table>
      <p><strong>Motivo:</strong><br>${escapeHtml(requestRow.reason)}</p>
      <p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#f6a800;color:#111827;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:700;">Abrir bandeja</a></p>
    </div>
  `;

  const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': brevoApiKey
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: recipientEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      replyTo: personEmail ? { email: personEmail, name: personName } : undefined,
      subject,
      htmlContent: html,
      textContent
    })
  });

  const emailData = await emailResponse.json().catch(() => ({}));

  if (!emailResponse.ok) {
    return new Response(JSON.stringify({ error: 'Email provider error', details: emailData }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
