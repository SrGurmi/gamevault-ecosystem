import { serve } from "std/server"
import { createClient } from "supabase"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotificationType = 'new_loan' | 'loan_reminder' | 'loan_overdue' | 'system_alert' | 'weekly_report'

const NOTIFICATION_MESSAGES: Record<NotificationType, { title: string; body: (data: Record<string, string>) => string }> = {
  new_loan: {
    title: '📦 Nuevo préstamo registrado',
    body: (d) => `Se ha registrado el préstamo de "${d.gameTitle}". Devuélvelo antes del ${d.dueDate}.`,
  },
  loan_reminder: {
    title: '⏰ Recordatorio de préstamo',
    body: (d) => `Tu préstamo de "${d.gameTitle}" vence mañana. ¡No olvides devolverlo!`,
  },
  loan_overdue: {
    title: '🚨 Préstamo vencido',
    body: (d) => `El préstamo de "${d.gameTitle}" está vencido. Por favor, devuélvelo cuanto antes.`,
  },
  system_alert: {
    title: '🔔 Aviso del sistema',
    body: (d) => d.message ?? 'Tienes un nuevo aviso de GameVault.',
  },
  weekly_report: {
    title: '📊 Resumen semanal',
    body: (d) => `Esta semana tienes ${d.activeLoans ?? '0'} préstamos activos en GameVault.`,
  },
}

const PREFERENCE_FIELD: Record<NotificationType, string> = {
  new_loan: 'new_loans',
  loan_reminder: 'loan_reminders',
  loan_overdue: 'loan_reminders',
  system_alert: 'system_alerts',
  weekly_report: 'weekly_report',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { type, userId, userIds, data = {} }: {
      type: NotificationType
      userId?: string
      userIds?: string[]
      data?: Record<string, string>
    } = await req.json()

    if (!type || (!userId && !userIds?.length)) {
      return new Response(
        JSON.stringify({ error: 'Se requieren los campos: type y userId (o userIds)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const targetIds = userIds ?? (userId ? [userId] : [])
    const preferenceField = PREFERENCE_FIELD[type]

    // 1. filter to users who have this notification type enabled
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', targetIds)
      .eq(preferenceField, true)

    if (prefsError) throw prefsError

    const enabledUserIds = (prefs ?? []).map((p: { user_id: string }) => p.user_id)

    if (!enabledUserIds.length) {
      return new Response(
        JSON.stringify({ message: 'Ningún usuario tiene esta notificación activada', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. fetch device tokens for those users
    const { data: tokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('token, platform')
      .in('user_id', enabledUserIds)

    if (tokensError) throw tokensError
    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ message: 'No hay dispositivos registrados', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. build Expo Push messages
    const { title, body } = NOTIFICATION_MESSAGES[type]
    const messages = tokens.map((t: { token: string; platform: string }) => ({
      to: t.token,
      sound: 'default',
      title,
      body: body(data),
      data: { type, ...data },
    }))

    // 4. send in chunks of 100 (Expo Push API limit)
    const chunks = []
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100))
    }

    const results = []
    for (const chunk of chunks) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      })
      const json = await res.json()
      results.push(json)
    }

    return new Response(
      JSON.stringify({ message: 'Notificaciones enviadas', sent: messages.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error en send-notification:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
