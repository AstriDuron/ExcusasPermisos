import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Filter,
  History,
  Info,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Upload,
  UserCheck,
  Users,
  UserX,
  XCircle
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';

const STORAGE_KEY = 'institucion-excusas-v1';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowSignups = import.meta.env.VITE_ALLOW_SIGNUPS === 'true';
const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
const LOGO_SRC = '/logo-minas.jpg';

const demoStaff = [
  { id: 'maria', name: 'María Fernanda López', role: 'Docente', area: 'Primaria' },
  { id: 'carlos', name: 'Carlos Rivera', role: 'Docente', area: 'Matemáticas' },
  { id: 'ana', name: 'Ana Martínez', role: 'Orientación', area: 'Consejería' },
  { id: 'admin', name: 'Dirección Académica', role: 'Administrador', area: 'Administración' }
];

const seedRequests = [
  {
    id: 'EXC-1024',
    personId: 'maria',
    personName: 'María Fernanda López',
    type: 'Excusa',
    category: 'Médica',
    startDate: '2026-10-01',
    endDate: '2026-10-01',
    schedule: 'Matutina',
    classHours: 4,
    reason: 'Consulta médica programada.',
    status: 'Pendiente',
    createdAt: '2026-10-01',
    reviewedBy: '',
    reviewComment: '',
    attachment: {
      name: 'constancia-medica.pdf',
      type: 'application/pdf',
      size: 84210,
      dataUrl: ''
    }
  },
  {
    id: 'PER-1023',
    personId: 'carlos',
    personName: 'Carlos Rivera',
    type: 'Permiso',
    category: 'Personal',
    startDate: '2026-09-28',
    endDate: '2026-09-28',
    schedule: 'Matutina',
    classHours: 2,
    reason: 'Trámite bancario impostergable.',
    status: 'Aprobada',
    createdAt: '2026-09-25',
    reviewedBy: 'Dirección Académica',
    reviewComment: 'Autorizado con reposición de clase.',
    attachment: null
  },
  {
    id: 'EXC-1022',
    personId: 'ana',
    personName: 'Ana Martínez',
    type: 'Excusa',
    category: 'Emergencia familiar',
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    schedule: 'Vespertina',
    classHours: 3,
    reason: 'Atención a emergencia familiar.',
    status: 'Rechazada',
    createdAt: '2026-09-18',
    reviewedBy: 'Dirección Académica',
    reviewComment: 'Falta completar comprobante solicitado.',
    attachment: null
  }
];

const categories = ['Médica', 'Personal', 'Institucional', 'Emergencia familiar', 'Académica', 'Otro'];
const schedules = ['Matutina', 'Vespertina'];
const statuses = ['Pendiente', 'Aprobada', 'Rechazada'];

const typeToDb = { Excusa: 'excusa', Permiso: 'permiso' };
const typeFromDb = { excusa: 'Excusa', permiso: 'Permiso' };
const statusToDb = { Pendiente: 'pendiente', Aprobada: 'aprobada', Rechazada: 'rechazada' };
const statusFromDb = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

function loadRequests() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : seedRequests;
  } catch {
    return seedRequests;
  }
}

function stripFileForStorage(request) {
  if (!request.attachment) return request;
  const { file, ...attachment } = request.attachment;
  return { ...request, attachment };
}

function saveRequests(requests) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests.map(stripFileForStorage)));
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value) {
  if (!value) return '';
  const [hours = '00', minutes = '00'] = String(value).split(':');
  return new Intl.DateTimeFormat('es-HN', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(`2026-01-01T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`));
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthLabel(value) {
  return new Intl.DateTimeFormat('es-HN', {
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function addMonths(value, amount) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function getCalendarCells(viewDate) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    return {
      date: cellDate,
      iso: toISODate(cellDate),
      isCurrentMonth: cellDate.getMonth() === viewDate.getMonth()
    };
  });
}

function formatRequestPeriod(request) {
  if (request.startDate !== request.endDate) {
    return `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
  }

  return formatDate(request.startDate);
}

function formatRequestPeriodHint(request) {
  return request.startDate !== request.endDate ? 'Rango de fechas' : 'Un día';
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getInitials(name) {
  return String(name || 'Usuario')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getEmailDisplayName(person) {
  const emailName = person?.email?.split('@')[0]?.trim();
  return emailName || person?.full_name || 'Personal';
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function statusIcon(status) {
  if (status === 'Aprobada') return <CheckCircle2 size={16} />;
  if (status === 'Rechazada') return <XCircle size={16} />;
  return <Clock3 size={16} />;
}

function sanitizeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function getRequestCode(type) {
  const prefix = type === 'Permiso' ? 'PER' : 'EXC';
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function createHistoryEvent(action, title, actorName, details = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action,
    title,
    actorName,
    createdAt: new Date().toISOString(),
    ...details
  };
}

function mapRemoteHistoryEvent(event) {
  return {
    id: event.id,
    action: event.action,
    title: event.title,
    actorName: event.actor_name || 'Sistema',
    fromStatus: statusFromDb[event.from_status] ?? event.from_status ?? '',
    toStatus: statusFromDb[event.to_status] ?? event.to_status ?? '',
    comment: event.comment ?? '',
    createdAt: event.created_at
  };
}

function buildRequestHistory(request) {
  const events = Array.isArray(request.history) ? [...request.history] : [];

  if (!events.some((event) => event.action === 'created')) {
    events.push({
      id: `${request.id}-created`,
      action: 'created',
      title: 'Solicitud registrada',
      actorName: request.personName,
      createdAt: request.createdAt ? `${request.createdAt}T12:00:00` : ''
    });
  }

  if (request.attachment && !events.some((event) => event.action === 'attachment_added')) {
    events.push({
      id: `${request.id}-attachment`,
      action: 'attachment_added',
      title: 'Comprobante adjuntado',
      actorName: request.personName,
      comment: request.attachment.name,
      createdAt: request.createdAt ? `${request.createdAt}T12:05:00` : ''
    });
  }

  if (request.status !== 'Pendiente' && !events.some((event) => event.action === 'status_changed')) {
    events.push({
      id: `${request.id}-review`,
      action: 'status_changed',
      title: `Estado cambiado a ${request.status.toLowerCase()}`,
      actorName: request.reviewedBy || 'Administración',
      fromStatus: 'Pendiente',
      toStatus: request.status,
      comment: request.reviewComment,
      createdAt: request.createdAt ? `${request.createdAt}T12:10:00` : ''
    });
  }

  return events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function mapProfileHistoryEvent(event) {
  return {
    id: event.id,
    action: event.action,
    title: event.title,
    actorName: event.actor_name || 'Sistema',
    fromStatus: event.from_status || '',
    toStatus: event.to_status || '',
    comment: event.comment ?? '',
    createdAt: event.created_at
  };
}

function buildProfileHistory(person) {
  const events = Array.isArray(person.history) ? [...person.history] : [];

  if (!events.some((event) => event.action === 'registered')) {
    events.push({
      id: `${person.id}-registered`,
      action: 'registered',
      title: 'Registro solicitado',
      actorName: getEmailDisplayName(person),
      createdAt: person.created_at
    });
  }

  return events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function mapRemoteRequest(row) {
  const firstFile = Array.isArray(row.request_files) ? row.request_files[0] : null;
  const request = {
    uuid: row.id,
    id: row.request_code,
    personId: row.user_id,
    personName: row.profiles?.full_name ?? 'Personal',
    personArea: row.profiles?.department ?? '',
    type: typeFromDb[row.type] ?? 'Excusa',
    category: row.category,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time?.slice(0, 5) ?? '',
    endTime: row.end_time?.slice(0, 5) ?? '',
    schedule: row.schedule,
    classHours: row.class_hours ?? '',
    reason: row.reason,
    status: statusFromDb[row.status] ?? 'Pendiente',
    createdAt: row.created_at?.slice(0, 10) ?? '',
    reviewedBy: row.reviewed_by ?? '',
    reviewComment: row.review_comment ?? '',
    attachment: firstFile
      ? {
          id: firstFile.id,
          name: firstFile.file_name,
          type: firstFile.file_type,
          size: firstFile.file_size,
          path: firstFile.file_path,
          dataUrl: firstFile.signedUrl ?? ''
        }
      : null
  };
  return {
    ...request,
    history: buildRequestHistory({
      ...request,
      history: Array.isArray(row.request_events) ? row.request_events.map(mapRemoteHistoryEvent) : []
    })
  };
}

function App() {
  const [requests, setRequests] = useState(isSupabaseConfigured ? [] : loadRequests);
  const [activeDemoUserId, setActiveDemoUserId] = useState('maria');
  const [activeView, setActiveView] = useState(isSupabaseConfigured ? 'mine' : 'new');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [reportStatusFilter, setReportStatusFilter] = useState('Todas');
  const [month, setMonth] = useState(getCurrentMonth());
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authErrorNotice, setAuthErrorNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState('warning');

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let isMounted = true;

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data.session ?? null);
      setIsLoading(Boolean(data.session));
    }

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true);
      }
      setSession(nextSession);
      setIsLoading(Boolean(nextSession));
      if (!nextSession) {
        setProfile(null);
        setRequests([]);
        setPeople([]);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user?.id) return;
    loadRemoteData();
  }, [session?.user?.id]);

  const demoUser = demoStaff.find((person) => person.id === activeDemoUserId) ?? demoStaff[0];
  const activeUser = isSupabaseConfigured
    ? {
        id: profile?.id ?? session?.user?.id,
        name: profile?.full_name ?? session?.user?.email ?? 'Usuario',
        role: profile?.role === 'admin' ? 'Administrador' : profile?.position ?? 'Personal',
        area: profile?.department ?? 'Institución',
        active: profile?.active ?? false
      }
    : demoUser;
  const isAdmin = isSupabaseConfigured ? profile?.role === 'admin' : activeUser.id === 'admin';
  const isActiveUser = isSupabaseConfigured ? Boolean(profile?.active) : true;

  useEffect(() => {
    if (isSupabaseConfigured && profile) {
      setActiveView(profile.role === 'admin' ? 'mine' : 'new');
    }
  }, [profile?.role]);

  async function loadRemoteData({ preserveNotice = false } = {}) {
    setIsLoading(true);
    if (!preserveNotice) {
      setNotice('');
      setNoticeTone('warning');
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, department, position, active, created_at')
      .eq('id', session.user.id)
      .single();

    if (profileError) {
      setNotice('No se pudo cargar el perfil. Verifica que el SQL de seguridad ya fue ejecutado.');
      setIsLoading(false);
      return;
    }

    setProfile(profileRow);

    if (!profileRow.active) {
      setAuthErrorNotice('Tu solicitud de acceso aún no ha sido aprobada por administración.');
      setRequests([]);
      setPeople([]);
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }

    setAuthErrorNotice('');

    const requestSelect =
      'id, request_code, user_id, type, category, start_date, end_date, start_time, end_time, schedule, class_hours, reason, status, review_comment, reviewed_by, created_at, profiles:user_id(full_name, department, position), request_files(id, file_name, file_type, file_size, file_path), request_events(id, action, title, actor_id, actor_name, from_status, to_status, comment, created_at)';
    const fallbackRequestSelect =
      'id, request_code, user_id, type, category, start_date, end_date, start_time, end_time, schedule, reason, status, review_comment, reviewed_by, created_at, profiles:user_id(full_name, department, position), request_files(id, file_name, file_type, file_size, file_path)';

    let { data: requestRows, error: requestError } = await supabase
      .from('requests')
      .select(requestSelect)
      .order('created_at', { ascending: false });

    if (requestError) {
      const fallback = await supabase
        .from('requests')
        .select(fallbackRequestSelect)
        .order('created_at', { ascending: false });
      requestRows = fallback.data;
      requestError = fallback.error;
    }

    if (requestError) {
      setNotice('No se pudieron cargar las solicitudes. Revisa las políticas RLS.');
      setIsLoading(false);
      return;
    }

    const rowsWithSignedUrls = await Promise.all(
      (requestRows ?? []).map(async (row) => {
        const files = Array.isArray(row.request_files) ? row.request_files : [];
        if (!files[0]?.file_path) return row;

        const { data } = await supabase.storage.from('comprobantes').createSignedUrl(files[0].file_path, 60 * 30);
        return {
          ...row,
          request_files: [{ ...files[0], signedUrl: data?.signedUrl ?? '' }]
        };
      })
    );

    setRequests(rowsWithSignedUrls.map(mapRemoteRequest));

    if (profileRow.role === 'admin') {
      let { data: peopleRows, error: peopleError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, department, position, active, email_confirmed_at, created_at')
        .order('created_at', { ascending: false });

      if (peopleError) {
        const fallback = await supabase
          .from('profiles')
          .select('id, email, full_name, role, department, position, active, created_at')
          .order('created_at', { ascending: false });
        peopleRows = fallback.data;
        peopleError = fallback.error;
      }

      if (!peopleError) {
        const { data: profileEvents } = await supabase
          .from('profile_events')
          .select('id, profile_id, action, title, actor_id, actor_name, from_status, to_status, comment, created_at')
          .order('created_at', { ascending: false });
        const eventsByProfile = (profileEvents ?? []).reduce((acc, event) => {
          const current = acc.get(event.profile_id) ?? [];
          current.push(mapProfileHistoryEvent(event));
          acc.set(event.profile_id, current);
          return acc;
        }, new Map());

        setPeople((peopleRows ?? []).map((person) => ({
          ...person,
          history: buildProfileHistory({ ...person, history: eventsByProfile.get(person.id) ?? [] })
        })));
      }
    } else {
      setPeople([]);
    }

    setIsLoading(false);
  }

  const visibleRequests = useMemo(() => {
    return requests
      .filter((request) => (isAdmin ? true : request.personId === activeUser.id))
      .filter((request) => statusFilter === 'Todas' || request.status === statusFilter)
      .filter((request) => {
        const haystack = [
          request.personName,
          request.type,
          request.category,
          request.reason,
          request.status
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
      .sort((a, b) => `${b.createdAt}${b.id}`.localeCompare(`${a.createdAt}${a.id}`));
  }, [activeUser.id, isAdmin, query, requests, statusFilter]);

  const reportRows = useMemo(() => {
    return requests
      .filter((request) => request.startDate.startsWith(month))
      .filter((request) => reportStatusFilter === 'Todas' || request.status === reportStatusFilter);
  }, [requests, month, reportStatusFilter]);

  const metrics = useMemo(() => {
    const scoped = isAdmin ? requests : requests.filter((request) => request.personId === activeUser.id);
    return {
      total: scoped.length,
      pending: scoped.filter((request) => request.status === 'Pendiente').length,
      approved: scoped.filter((request) => request.status === 'Aprobada').length,
      rejected: scoped.filter((request) => request.status === 'Rechazada').length
    };
  }, [activeUser.id, isAdmin, requests]);

  function persistLocal(nextRequests) {
    setRequests(nextRequests);
    saveRequests(nextRequests);
  }

  async function addRequest(payload) {
    setNotice('');

    if (!payload.attachment?.file) {
      setNotice('Debe adjuntar un comprobante para enviar la solicitud.');
      return false;
    }

    if (payload.startDate > payload.endDate) {
      setNotice('La fecha final no puede ser menor que la fecha de inicio.');
      return false;
    }

    const classHours = Number(payload.classHours);
    if (!Number.isFinite(classHours) || classHours <= 0 || classHours > 12) {
      setNotice('Debe indicar un número de horas clase válido.');
      return false;
    }

    if (!isSupabaseConfigured) {
      const nextRequest = {
        ...stripFileForStorage(payload),
        id: getRequestCode(payload.type),
        personId: activeUser.id,
        personName: activeUser.name,
        status: 'Pendiente',
        createdAt: new Date().toISOString().slice(0, 10),
        reviewedBy: '',
        reviewComment: '',
        history: [
          createHistoryEvent('created', 'Solicitud registrada', activeUser.name),
          ...(payload.attachment
            ? [createHistoryEvent('attachment_added', 'Comprobante adjuntado', activeUser.name, { comment: payload.attachment.name })]
            : [])
        ]
      };
      persistLocal([nextRequest, ...requests]);
      setActiveView('mine');
      return true;
    }

    const insertPayload = {
      request_code: getRequestCode(payload.type),
      user_id: session.user.id,
      type: typeToDb[payload.type],
      category: payload.category,
      start_date: payload.startDate,
      end_date: payload.endDate,
      start_time: null,
      end_time: null,
      schedule: payload.schedule,
      class_hours: classHours,
      reason: payload.reason.trim(),
      status: 'pendiente'
    };

    const { data: inserted, error: insertError } = await supabase
      .from('requests')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      setNotice('No se pudo crear la solicitud. Revisa tu sesión y las políticas RLS.');
      return false;
    }

    await supabase.from('request_events').insert({
      request_id: inserted.id,
      actor_id: session.user.id,
      actor_name: activeUser.name,
      action: 'created',
      title: 'Solicitud registrada'
    });

    if (payload.attachment?.file) {
      const file = payload.attachment.file;
      const filePath = `${session.user.id}/${inserted.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from('comprobantes').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

      if (uploadError) {
        setNotice('La solicitud fue creada, pero el comprobante no se pudo subir.');
      } else {
        const { error: fileError } = await supabase.from('request_files').insert({
          request_id: inserted.id,
          owner_id: session.user.id,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size
        });
        if (fileError) setNotice('El comprobante subió, pero no se pudo registrar en la base.');
        if (!fileError) {
          await supabase.from('request_events').insert({
            request_id: inserted.id,
            actor_id: session.user.id,
            actor_name: activeUser.name,
            action: 'attachment_added',
            title: 'Comprobante adjuntado',
            comment: file.name
          });
        }
      }
    }

    supabase.functions.invoke('notify-new-request', {
      body: { requestId: inserted.id }
    }).then(({ error }) => {
      if (error) console.warn('No se pudo enviar la notificación por correo.', error);
    });

    await loadRemoteData();
    setActiveView('mine');
    return true;
  }

  async function reviewRequest(id, status, reviewComment) {
    setNotice('');
    const currentRequest = requests.find((request) => (request.uuid ?? request.id) === id);

    if (currentRequest?.status === 'Aprobada') {
      setNotice('Esta solicitud ya está aprobada y no puede cambiar de estado.');
      return;
    }

    if (!isSupabaseConfigured) {
      persistLocal(
        requests.map((request) =>
          request.id === id
            ? {
                ...request,
                status,
                reviewedBy: activeUser.name,
                reviewComment,
                history: buildRequestHistory({
                  ...request,
                  status,
                  reviewedBy: activeUser.name,
                  reviewComment,
                  history: [
                    ...(request.history ?? []),
                    createHistoryEvent('status_changed', `Estado cambiado a ${status.toLowerCase()}`, activeUser.name, {
                      fromStatus: request.status,
                      toStatus: status,
                      comment: reviewComment
                    })
                  ]
                })
              }
            : request
        )
      );
      return;
    }

    const { error } = await supabase
      .from('requests')
      .update({
        status: statusToDb[status],
        review_comment: reviewComment.trim(),
        reviewed_by: activeUser.id
      })
      .eq('id', id);

    if (error) {
      setNotice('No se pudo actualizar el estado. Solo un administrador puede revisar solicitudes.');
      return;
    }

    await supabase.from('request_events').insert({
      request_id: id,
      actor_id: activeUser.id,
      actor_name: activeUser.name,
      action: 'status_changed',
      title: `Estado cambiado a ${status.toLowerCase()}`,
      from_status: statusToDb[currentRequest?.status] ?? null,
      to_status: statusToDb[status],
      comment: reviewComment.trim()
    });

    await loadRemoteData();
  }

  async function updatePerson(personId, updates, comment = '') {
    setNotice('');
    setNoticeTone('warning');

    if (!isSupabaseConfigured || !isAdmin) {
      return { ok: false, message: 'No se pudo actualizar porque la sesión de administrador no está disponible.' };
    }

    if (personId === activeUser.id && updates.active === false) {
      const message = 'No puede inactivar su propia cuenta de administrador desde este panel.';
      setNotice(message);
      return { ok: false, message };
    }

    const targetPerson = people.find((person) => person.id === personId);

    if (updates.active === true && !targetPerson?.email_confirmed_at) {
      const message = 'No se puede aprobar el acceso hasta que el usuario confirme su correo.';
      setNotice(message);
      return { ok: false, message };
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'active')) {
      const { error } = await supabase.rpc('set_profile_access', {
        target_profile_id: personId,
        target_active: updates.active,
        review_comment: comment.trim()
      });

      if (error) {
        const normalizedMessage = error.message?.toLowerCase() ?? '';
        const message = normalizedMessage.includes('correo') || normalizedMessage.includes('confirm')
          ? 'No se puede aprobar el acceso hasta que el usuario confirme su correo.'
          : normalizedMessage.includes('function')
            ? 'Falta ejecutar la migración de aprobación de accesos en Supabase.'
            : 'No se pudo actualizar el acceso del usuario. Verifica que tu usuario administrador esté activo.';
        setNotice(message);
        return { ok: false, message };
      }

      setNoticeTone('success');
      const message = updates.active ? 'Acceso aprobado correctamente.' : 'Acceso inactivado correctamente.';
      setNotice(message);
      await loadRemoteData({ preserveNotice: true });
      return { ok: true, message };
    } else if (Object.prototype.hasOwnProperty.call(updates, 'role')) {
      if (personId === activeUser.id && updates.role !== 'admin') {
        const message = 'No puede quitarse su propio acceso de administrador.';
        setNotice(message);
        return { ok: false, message };
      }

      if (updates.role === 'admin' && (!targetPerson?.active || !targetPerson?.email_confirmed_at)) {
        const message = 'Primero debe confirmar correo y tener acceso activo antes de darle rol de administrador.';
        setNotice(message);
        return { ok: false, message };
      }

      const { error } = await supabase.rpc('set_profile_role', {
        target_profile_id: personId,
        target_role: updates.role
      });

      if (error) {
        const normalizedMessage = error.message?.toLowerCase() ?? '';
        const message = normalizedMessage.includes('confirm') || normalizedMessage.includes('activo') || normalizedMessage.includes('correo')
          ? 'Primero debe confirmar correo y tener acceso activo antes de darle rol de administrador.'
          : normalizedMessage.includes('function')
          ? 'Falta ejecutar la migración de roles de administrador en Supabase.'
          : 'No se pudo actualizar el rol. Verifica que tu usuario administrador esté activo.';
        setNotice(message);
        return { ok: false, message };
      }

      setNoticeTone('success');
      const message = updates.role === 'admin'
        ? 'Rol actualizado a administrador.'
        : 'Rol cambiado a personal.';
      setNotice(message);
      await loadRemoteData({ preserveNotice: true });
      return { ok: true, message };
    } else {
      const { data: updatedPerson, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', personId)
        .select('id')
        .single();

      if (error || !updatedPerson) {
        const message = 'No se pudo actualizar el usuario. Verifica los permisos de administración.';
        setNotice(message);
        return { ok: false, message };
      }
    }

    setPeople((currentPeople) =>
      currentPeople.map((item) => (item.id === personId ? { ...item, ...updates } : item))
    );
    await loadRemoteData({ preserveNotice: true });
    return { ok: true, message: 'Usuario actualizado correctamente.' };
  }

  async function resendConfirmationEmail(person) {
    setNotice('');
    setNoticeTone('warning');

    if (!isSupabaseConfigured || !isAdmin) {
      return {
        ok: false,
        message: 'No se pudo reenviar porque la sesión de administrador no está disponible.'
      };
    }

    if (!person?.email) {
      const message = 'No se puede reenviar el correo porque el usuario no tiene correo sincronizado.';
      setNotice(message);
      return { ok: false, message };
    }

    if (person.email_confirmed_at) {
      const message = 'Este usuario ya confirmó su correo.';
      setNotice(message);
      return { ok: false, message };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: person.email,
      options: {
        emailRedirectTo: appUrl
      }
    });

    if (error) {
      const normalizedMessage = error.message?.toLowerCase() ?? '';
      const message = normalizedMessage.includes('rate') || normalizedMessage.includes('limit')
        ? 'Supabase limitó el reenvío por seguridad. Espera unos minutos antes de intentar otra vez.'
        : 'No se pudo reenviar el correo de confirmación. Revisa la configuración SMTP y los logs.';
      setNotice(message);
      return { ok: false, message };
    }

    const message = `Correo de confirmación reenviado a ${person.email}.`;
    setNoticeTone('success');
    setNotice(message);
    return { ok: true, message };
  }

  function exportReport() {
    const rows = [
      ['ID', 'Personal', 'Tipo', 'Categoria', 'Inicio', 'Fin', 'Jornada', 'Horas clase', 'Estado', 'Comprobante', 'Comentario'],
      ...reportRows.map((request) => [
        request.id,
        request.personName,
        request.type,
        request.category,
        request.startDate,
        request.endDate,
        request.schedule,
        request.classHours || '',
        request.status,
        request.attachment?.name ?? '',
        request.reviewComment
      ])
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe-excusas-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const tabs = [
    { id: 'new', label: 'Nueva solicitud', icon: Plus, staffOnly: true },
    { id: 'mine', label: isAdmin ? 'Todas las solicitudes' : 'Mis solicitudes', icon: ClipboardList },
    { id: 'report', label: 'Informe mensual', icon: FileCheck2, adminOnly: true },
    { id: 'people', label: 'Personal', icon: Users, adminOnly: true }
  ].filter((tab) => (tab.adminOnly ? isAdmin : true) && (tab.staffOnly ? !isAdmin : true));
  const activeTab = tabs.find((tab) => tab.id === activeView);

  if (isSupabaseConfigured && isLoading && !session) {
    return <LoadingScreen />;
  }

  if (isSupabaseConfigured && !session) {
    return (
      <AuthScreen
        externalError={authErrorNotice}
        onAuthError={setAuthErrorNotice}
        onClearExternalError={() => setAuthErrorNotice('')}
      />
    );
  }

  if (isSupabaseConfigured && session && isRecoveringPassword) {
    return <PasswordRecoveryScreen onDone={() => setIsRecoveringPassword(false)} />;
  }

  if (isSupabaseConfigured && session && !profile && isLoading) {
    return <LoadingScreen />;
  }

  if (isSupabaseConfigured && profile && !isActiveUser) {
    return <AccessPendingScreen profile={profile} onSignOut={handleSignOut} />;
  }

  return (
    <main className={`app-shell ${isAdmin ? 'admin-shell' : 'staff-shell'} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Navegación principal">
        {!isSupabaseConfigured && (
          <>
            <label className="field-label" htmlFor="active-user">
              Acceso de prueba
            </label>
            <div className="select-wrap">
              <LogIn size={18} />
              <select
                id="active-user"
                value={activeDemoUserId}
                onChange={(event) => {
                  const nextUser = demoStaff.find((person) => person.id === event.target.value);
                  setActiveDemoUserId(event.target.value);
                  setActiveView(nextUser?.id === 'admin' ? 'mine' : 'new');
                }}
              >
                {demoStaff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="profile-strip">
          <div className="user-avatar" aria-hidden="true">{getInitials(activeUser.name)}</div>
          <div className="profile-copy">
            <strong>{activeUser.name}</strong>
            <span>{activeUser.role}</span>
            <small>{activeUser.area}</small>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Minimizar menú'}
            title={isSidebarCollapsed ? 'Expandir menú' : 'Minimizar menú'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="security-note">
            <AlertTriangle size={16} />
            <span>Modo demo local. Configure Supabase para login y datos protegidos.</span>
          </div>
        )}

        <span className="nav-section-label">Gestión</span>
        <nav className="nav-list">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeView === tab.id ? 'active' : ''}
                type="button"
                onClick={() => setActiveView(tab.id)}
                title={tab.label}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer-brand">
          <div className="brand-mark brand-initials" aria-hidden="true">ITR</div>
          <div className="sidebar-text">
            <span>Instituto Técnico Regional</span>
            <strong>Minas de Oro</strong>
          </div>
        </div>

        {isSupabaseConfigured && (
          <button className="ghost-action logout-action" type="button" onClick={handleSignOut} title="Cerrar sesión">
            <LogOut size={17} />
            <span>Cerrar sesión</span>
          </button>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{activeTab?.label || (isAdmin ? 'Solicitudes' : 'Nueva solicitud')}</h2>
            <span className="topbar-subtitle">
              {isAdmin
                ? 'Revise solicitudes, comprobantes e informes mensuales.'
                : 'Registre permisos y consulte el estado de sus solicitudes.'}
            </span>
          </div>
        </header>

        {notice && (
          <div className={`notice ${noticeTone === 'success' ? 'success' : ''}`} role="status">
            {noticeTone === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {notice}
          </div>
        )}

        {isLoading && <LoadingInline />}
        {!isLoading && activeView === 'new' && <RequestForm onSubmit={addRequest} />}
        {!isLoading && activeView === 'mine' && (
          <RequestList
            isAdmin={isAdmin}
            requests={visibleRequests}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onReview={reviewRequest}
          />
        )}
        {!isLoading && activeView === 'report' && isAdmin && (
          <MonthlyReport
            month={month}
            setMonth={setMonth}
            statusFilter={reportStatusFilter}
            setStatusFilter={setReportStatusFilter}
            rows={reportRows}
            onExport={exportReport}
            onReview={reviewRequest}
          />
        )}
        {!isLoading && activeView === 'people' && isAdmin && (
          <PeopleManagement
            people={people}
            currentUserId={activeUser.id}
            onUpdatePerson={updatePerson}
            onResendConfirmation={resendConfirmationEmail}
          />
        )}
      </section>
    </main>
  );
}

function getAuthErrorMessage(authError) {
  const rawMessage = authError?.message || '';
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Correo o clave incorrectos. Revisa tus datos e intenta nuevamente.';
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada o spam.';
  }

  if (normalizedMessage.includes('user already registered') || normalizedMessage.includes('already registered')) {
    return 'Este correo ya tiene una cuenta registrada.';
  }

  if (normalizedMessage.includes('password') && normalizedMessage.includes('6')) {
    return 'La clave debe tener al menos 6 caracteres.';
  }

  if (normalizedMessage.includes('invalid email') || normalizedMessage.includes('validate email')) {
    return 'Ingresa un correo válido.';
  }

  if (normalizedMessage.includes('signups not allowed') || normalizedMessage.includes('signup')) {
    return 'El registro no está habilitado en este momento.';
  }

  return 'No pudimos completar la acción. Revisa los datos e intenta nuevamente.';
}

function getAccessStatusMessage(status) {
  if (status === 'pending') {
    return 'Este correo ya tiene una solicitud pendiente. Administración aún no ha aprobado el acceso.';
  }

  if (status === 'active') {
    return 'Este correo ya tiene una cuenta activa. Usa iniciar sesión o restablece tu contraseña.';
  }

  if (status === 'inactive') {
    return 'Este correo ya fue registrado, pero el acceso está inactivo. Consulta con administración.';
  }

  return '';
}

async function findAccessStatusByEmail(email) {
  const { data, error } = await supabase.rpc('get_access_request_status', {
    lookup_email: email
  });

  if (error) return '';
  return data || '';
}

function PasswordInput({ value, onChange, autoComplete }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="input-icon password-input">
      <LockKeyhole size={17} />
      <input
        type={isVisible ? 'text' : 'password'}
        minLength="8"
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required
      />
      <button
        className="password-toggle"
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {isVisible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function AuthScreen({ externalError = '', onAuthError = () => {}, onClearExternalError = () => {} }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (externalError) {
      setMode('login');
      setError(externalError);
      setMessage('');
      setIsSubmitting(false);
    }
  }, [externalError]);

  function switchAuthMode(nextMode) {
    setMode(nextMode);
    setEmail('');
    setPassword('');
    setFullName('');
    setError('');
    setMessage('');
    onClearExternalError();
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    onClearExternalError();
    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    if (mode === 'forgot') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: appUrl
      });
      setIsSubmitting(false);

      if (resetError) {
        setError(getAuthErrorMessage(resetError));
        return;
      }

      setMessage('Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.');
      return;
    }

    if (mode === 'signup') {
      const existingStatus = await findAccessStatusByEmail(normalizedEmail);
      const existingStatusMessage = getAccessStatusMessage(existingStatus);

      if (existingStatusMessage) {
        setIsSubmitting(false);
        setError(existingStatusMessage);
        return;
      }

      const { data: signupData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: appUrl,
          data: {
            full_name: fullName.trim()
          }
        }
      });
      await supabase.auth.signOut();
      setIsSubmitting(false);

      if (authError) {
        setError(getAuthErrorMessage(authError));
        return;
      }

      if (Array.isArray(signupData?.user?.identities) && signupData.user.identities.length === 0) {
        setError('Este correo ya tiene una solicitud pendiente o una cuenta registrada.');
        return;
      }

      setPassword('');
      setFullName('');
      setEmail('');
      setMessage('Solicitud enviada correctamente. Revisa tu correo para confirmar la cuenta. Luego administración revisará y aprobará tu acceso.');
      return;
    }

    const { data: loginData, error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (authError) {
      setIsSubmitting(false);
      setError(getAuthErrorMessage(authError));
      return;
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', loginData.user.id)
      .maybeSingle();

    if (profileError || !profileRow) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setError('Tu perfil aún no está disponible. Intenta de nuevo en unos minutos o consulta con administración.');
      return;
    }

    if (!profileRow.active) {
      const pendingMessage = 'Tu solicitud de acceso aún no ha sido aprobada por administración.';
      onAuthError(pendingMessage);
      setError(pendingMessage);
      await supabase.auth.signOut();
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-block auth-brand">
          <div className="brand-mark">
            <img src={LOGO_SRC} alt="Logo Instituto Técnico Regional Minas de Oro" />
          </div>
          <div>
            <p className="eyebrow">Acceso seguro</p>
            <h1>Instituto Técnico Regional Minas de Oro</h1>
            <p>Gestión de excusas y permisos</p>
          </div>
        </div>

        {allowSignups && (
          <div className="segmented full">
            <button className={mode === 'login' ? 'selected' : ''} type="button" onClick={() => switchAuthMode('login')}>
              Iniciar sesión
            </button>
            <button className={mode === 'signup' ? 'selected' : ''} type="button" onClick={() => switchAuthMode('signup')}>
              Crear usuario
            </button>
          </div>
        )}

        <form className="request-form" onSubmit={handleAuth}>
          {mode === 'forgot' && (
            <div className="auth-info">
              Ingresa tu correo institucional y te enviaremos un enlace para crear una nueva contraseña.
            </div>
          )}
          {mode === 'signup' && (
            <label>
              <span>Nombre completo</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </label>
          )}
          <label>
            <span>Correo institucional</span>
            <div className="input-icon">
              <Mail size={17} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </label>
          {mode !== 'forgot' && (
            <label>
              <span>Contraseña</span>
              <PasswordInput
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
          )}

          {error && <div className="notice danger">{error}</div>}
          {message && <div className="notice success">{message}</div>}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            <LogIn size={18} />
            {isSubmitting
              ? 'Validando...'
              : mode === 'forgot'
                ? 'Enviar enlace'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Registrar'}
          </button>
          {mode === 'login' && (
            <button className="link-action" type="button" onClick={() => switchAuthMode('forgot')}>
              Olvidé mi contraseña
            </button>
          )}
          {mode === 'forgot' && (
            <button className="link-action" type="button" onClick={() => switchAuthMode('login')}>
              Volver a iniciar sesión
            </button>
          )}
          <p className="auth-copy">Acceso exclusivo para personal autorizado.</p>
        </form>
      </section>
    </main>
  );
}

function PasswordRecoveryScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(getAuthErrorMessage(updateError));
      return;
    }

    setMessage('Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.');
  }

  async function returnToLogin() {
    await supabase.auth.signOut();
    onDone();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-block auth-brand">
          <div className="brand-mark">
            <img src={LOGO_SRC} alt="Logo Instituto Técnico Regional Minas de Oro" />
          </div>
          <div>
            <p className="eyebrow">Restablecer acceso</p>
            <h1>Nueva contraseña</h1>
            <p>Ingresa una contraseña segura para recuperar tu acceso.</p>
          </div>
        </div>

        <form className="request-form" onSubmit={handlePasswordUpdate}>
          <label>
            <span>Nueva contraseña</span>
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            <span>Confirmar contraseña</span>
            <PasswordInput
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error && <div className="notice danger">{error}</div>}
          {message && <div className="notice success">{message}</div>}

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            <LockKeyhole size={18} />
            {isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
          {message && (
            <button className="link-action" type="button" onClick={returnToLogin}>
              Volver a iniciar sesión
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

function AccessPendingScreen({ profile, onSignOut }) {
  return (
    <main className="auth-shell">
      <section className="auth-card pending-card">
        <div className="brand-block auth-brand">
          <div className="brand-mark">
            <img src={LOGO_SRC} alt="Logo Instituto Técnico Regional Minas de Oro" />
          </div>
          <div>
            <p className="eyebrow">Acceso solicitado</p>
            <h1>Esperando aprobación</h1>
            <p>Tu cuenta fue registrada, pero administración aún debe activar tu acceso.</p>
          </div>
        </div>

        <div className="pending-detail">
          <span>Usuario</span>
          <strong>{profile.full_name}</strong>
          <span>Área</span>
          <strong>{profile.department}</strong>
        </div>

        <button className="primary-action" type="button" onClick={onSignOut}>
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <LoadingInline />
      </section>
    </main>
  );
}

function LoadingInline() {
  return (
    <div className="empty-state">
      <Clock3 size={34} />
      <strong>Cargando información</strong>
      <span>Un momento.</span>
    </div>
  );
}

function Metric({ label, value, tone }) {
  const metricIcons = {
    Total: ClipboardList,
    Solicitudes: ClipboardList,
    Personal: Users,
    Activos: UserCheck,
    Aprobadas: CheckCircle2,
    Pendientes: Clock3,
    Solicitados: Clock3,
    Rechazadas: XCircle,
    Administradores: UserCheck,
    Excusas: FileCheck2,
    Permisos: CalendarDays,
    'Con comprobante': Paperclip
  };
  const MetricIcon = metricIcons[label] ?? ClipboardList;

  return (
    <div className={`metric metric-${tone}`}>
      <i className="metric-icon" aria-hidden="true">
        <MetricIcon size={15} />
      </i>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DateRangePicker({ startDate, endDate, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${startDate || `${getCurrentMonth()}-01`}T12:00:00`));
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const cells = getCalendarCells(viewDate);
  const weekDays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const isRange = Boolean(startDate && endDate && startDate !== endDate);

  useEffect(() => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    if (startDate) setViewDate(new Date(`${startDate}T12:00:00`));
  }, [startDate, endDate]);

  function selectDate(iso) {
    if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
      setDraftStart(iso);
      setDraftEnd(iso);
      onChange({ startDate: iso, endDate: iso });
      return;
    }

    const nextStart = iso < draftStart ? iso : draftStart;
    const nextEnd = iso < draftStart ? draftStart : iso;
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    onChange({ startDate: nextStart, endDate: nextEnd });
    setIsOpen(false);
  }

  return (
    <div className="date-range-picker">
      <button className="range-trigger" type="button" onClick={() => setIsOpen((current) => !current)}>
        <CalendarDays size={17} />
        <span>{isRange ? `${formatDate(startDate)} - ${formatDate(endDate)}` : formatDate(startDate)}</span>
      </button>

      {isOpen && (
        <div className="calendar-popover">
          <div className="calendar-header">
            <button type="button" onClick={() => setViewDate((current) => addMonths(current, -1))} aria-label="Mes anterior">
              <ChevronLeft size={17} />
            </button>
            <strong>{getMonthLabel(viewDate)}</strong>
            <button type="button" onClick={() => setViewDate((current) => addMonths(current, 1))} aria-label="Mes siguiente">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="calendar-grid calendar-weekdays">
            {weekDays.map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const isSelected = cell.iso === startDate || cell.iso === endDate;
              const isInRange = startDate && endDate && cell.iso > startDate && cell.iso < endDate;
              return (
                <button
                  key={cell.iso}
                  className={`${cell.isCurrentMonth ? '' : 'muted'} ${isSelected ? 'selected' : ''} ${isInRange ? 'in-range' : ''}`}
                  type="button"
                  onClick={() => selectDate(cell.iso)}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
          <p>Selecciona inicio y luego final.</p>
        </div>
      )}
    </div>
  );
}

function RequestForm({ onSubmit }) {
  const [form, setForm] = useState({
    type: 'Excusa',
    category: 'Médica',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    startTime: '',
    endTime: '',
    schedule: 'Matutina',
    classHours: '',
    reason: '',
    attachment: null
  });
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);

  function updateField(field, value) {
    setForm((current) => {
      return { ...current, [field]: value };
    });
    setFormError('');
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    setFileError('');

    if (!file) {
      updateField('attachment', null);
      return;
    }

    const isAccepted = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isAccepted) {
      setFileError('Solo se permiten PDF o imágenes.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError('El archivo no debe superar 10 MB.');
      event.target.value = '';
      return;
    }

    setIsReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      updateField('attachment', {
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: typeof reader.result === 'string' ? reader.result : ''
      });
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      updateField('attachment', {
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: ''
      });
      setIsReadingFile(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (!form.reason.trim()) return;

    if (!form.attachment?.file) {
      setFormError('Debe adjuntar un comprobante para enviar la solicitud.');
      return;
    }

    if (form.startDate > form.endDate) {
      setFormError('La fecha final no puede ser menor que la fecha de inicio.');
      return;
    }

    const classHours = Number(form.classHours);
    if (!Number.isFinite(classHours) || classHours <= 0 || classHours > 12) {
      setFormError('Debe indicar un número de horas clase válido.');
      return;
    }

    const formElement = event.currentTarget;
    const wasSubmitted = await onSubmit(form);
    if (!wasSubmitted) return;

    setForm({
      type: 'Excusa',
      category: 'Médica',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      startTime: '',
      endTime: '',
      schedule: 'Matutina',
      classHours: '',
      reason: '',
      attachment: null
    });
    formElement.reset();
  }

  return (
    <section className="panel report-panel">
      <div className="section-heading">
        <div>
          <h3>Registrar excusa o permiso</h3>
        </div>
        <span className="status-pill status-pendiente">
          <Clock3 size={15} />
          Pendiente al enviar
        </span>
      </div>

      <form className="request-form" onSubmit={handleSubmit}>
        <div className="segmented" role="group" aria-label="Tipo de solicitud">
          {['Excusa', 'Permiso'].map((type) => (
            <button
              key={type}
              className={form.type === type ? 'selected' : ''}
              type="button"
              onClick={() => updateField('type', type)}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>Categoría</span>
            <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Jornada</span>
            <select value={form.schedule} onChange={(event) => updateField('schedule', event.target.value)}>
              {schedules.map((schedule) => (
                <option key={schedule}>{schedule}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Número de horas clase</span>
            <input
              type="number"
              min="0.5"
              max="12"
              step="0.5"
              value={form.classHours}
              onChange={(event) => updateField('classHours', event.target.value)}
              placeholder="Ej. 2"
              required
            />
          </label>
          <div className="form-control-group date-range-field">
            <span>Fechas</span>
            <div className="range-inputs">
              <label>
                <small>Inicial</small>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => {
                    const nextStartDate = event.target.value;
                    setForm((current) => ({
                      ...current,
                      startDate: nextStartDate,
                      endDate: current.endDate < nextStartDate ? nextStartDate : current.endDate
                    }));
                    setFormError('');
                  }}
                  required
                />
              </label>
              <label>
                <small>Final</small>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(event) => updateField('endDate', event.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        </div>

        <label className="wide-field">
          <span>Motivo</span>
          <textarea
            rows="5"
            value={form.reason}
            onChange={(event) => updateField('reason', event.target.value)}
            placeholder="Detalle el motivo de la excusa o permiso..."
            maxLength="1200"
            required
          />
        </label>

        <label className="upload-box">
          <Upload size={24} />
          <strong>{form.attachment ? form.attachment.name : 'Subir comprobante'}</strong>
          <span>
            {form.attachment
              ? `${formatFileSize(form.attachment.size)} guardado en esta solicitud`
              : 'PDF o imagen. Tamaño máximo 10 MB.'}
          </span>
          <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleFile} required />
        </label>
        {fileError && <div className="notice danger">{fileError}</div>}
        {formError && <div className="notice danger">{formError}</div>}

        <div className="form-actions">
          <button className="primary-action" type="submit" disabled={isReadingFile || !form.attachment}>
            <FileCheck2 size={18} />
            {isReadingFile ? 'Adjuntando...' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </section>
  );
}

function RequestList({ isAdmin, requests, query, setQuery, statusFilter, setStatusFilter, onReview }) {
  return (
    <section className="panel report-panel">
      <div className="section-heading">
        <div>
          <h3>{isAdmin ? 'Listado general' : 'Mis excusas y permisos'}</h3>
        </div>
      </div>

      <div className="report-summary">
        <Metric label="Total" value={requests.length} tone="neutral" />
        <Metric label="Pendientes" value={requests.filter((request) => request.status === 'Pendiente').length} tone="warning" />
        <Metric label="Aprobadas" value={requests.filter((request) => request.status === 'Aprobada').length} tone="success" />
        <Metric label="Rechazadas" value={requests.filter((request) => request.status === 'Rechazada').length} tone="danger" />
      </div>

      <div className="report-filter-panel">
        <ListTools
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      </div>

      <div className="report-content">
        <RequestTable requests={requests} isAdmin={isAdmin} onReview={onReview} />
      </div>
    </section>
  );
}

function ListTools({ query, setQuery, statusFilter, setStatusFilter }) {
  return (
    <div className="list-tools">
      <div className="search-box">
        <Search size={17} />
        <input
          aria-label="Buscar solicitudes"
          value={query}
          placeholder="Buscar"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="filter-box">
        <Filter size={17} />
        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option>Todas</option>
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RequestTable({ requests, isAdmin, onReview }) {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  if (requests.length === 0) return <EmptyState />;

  return (
    <>
      <div className="table-wrap requests-table-wrap">
        <table className="requests-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Solicitud</th>
              {isAdmin && <th>Personal</th>}
              <th>Periodo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <Fragment key={request.uuid ?? request.id}>
                <tr>
                  <td data-label="Código">
                    <strong>{request.id}</strong>
                  </td>
                  <td data-label="Solicitud">
                    <strong>{request.type}</strong>
                    <span>{request.category}</span>
                  </td>
                  {isAdmin && (
                    <td data-label="Personal">
                      <strong>{request.personName}</strong>
                      <span>{request.schedule} · {request.classHours || 0} horas</span>
                    </td>
                  )}
                  <td data-label="Periodo">
                    <strong>{formatRequestPeriod(request)}</strong>
                    <span>{formatRequestPeriodHint(request)}</span>
                  </td>
                  <td data-label="Estado">
                    <StatusPill status={request.status} />
                  </td>
                  <td data-label="Comprobante">
                    {request.attachment ? (
                      <span className="attachment-link compact-attachment">
                        <Paperclip size={15} />
                        <span>{request.attachment.name}</span>
                      </span>
                    ) : (
                      <span className="muted">Sin adjunto</span>
                    )}
                  </td>
                  <td data-label="Acciones">
                    <div className="table-action-group">
                      <button
                        className={`icon-action ${expandedHistoryId === (request.uuid ?? request.id) ? 'active' : ''}`}
                        type="button"
                        onClick={() => setExpandedHistoryId((current) => (current === (request.uuid ?? request.id) ? null : request.uuid ?? request.id))}
                        aria-label="Ver histórico"
                        title="Histórico"
                      >
                        <History size={17} />
                      </button>
                      <button className="secondary-action table-action" type="button" onClick={() => setSelectedRequest(request)}>
                        <Eye size={16} />
                        Ver detalle
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedHistoryId === (request.uuid ?? request.id) && (
                  <tr className="history-expand-row">
                    <td colSpan={isAdmin ? 7 : 6}>
                      <RequestHistory events={buildRequestHistory(request)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRequest && (
        <RequestDetailDrawer
          request={selectedRequest}
          isAdmin={isAdmin}
          onClose={() => setSelectedRequest(null)}
          onReview={onReview}
        />
      )}
    </>
  );
}

function RequestDetailDrawer({ request, isAdmin, onClose, onReview }) {
  const [comment, setComment] = useState(request.reviewComment ?? '');
  const isApproved = request.status === 'Aprobada';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleReview(status) {
    await onReview(request.uuid ?? request.id, status, comment);
    onClose();
  }

  return (
    <div className="detail-drawer-layer" role="presentation">
      <button className="detail-drawer-backdrop" type="button" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className="detail-drawer" aria-label="Detalle de solicitud">
        <div className="drawer-header">
          <div>
            <span className="request-code">{request.id}</span>
            <h3>{request.type} por {request.category.toLowerCase()}</h3>
          </div>
          <button className="icon-action drawer-close-action" type="button" aria-label="Cerrar detalle" onClick={onClose}>
            <XCircle size={22} />
            <span>Volver</span>
          </button>
        </div>

        <StatusPill status={request.status} />

        <div className="drawer-details">
          {isAdmin && (
            <div>
              <span>Personal</span>
              <strong>{request.personName}</strong>
            </div>
          )}
          <div>
            <span>Periodo</span>
            <strong>{formatRequestPeriod(request)}</strong>
          </div>
          <div>
            <span>Jornada</span>
            <strong>{request.schedule}</strong>
          </div>
          <div>
            <span>Horas clase</span>
            <strong>{request.classHours || 0}</strong>
          </div>
          <div>
            <span>Motivo</span>
            <p>{request.reason}</p>
          </div>
          {request.reviewComment && (
            <div>
              <span>Comentario de revisión</span>
              <p>{request.reviewComment}</p>
            </div>
          )}
        </div>

        <AttachmentPreview attachment={request.attachment} />

        {isAdmin && onReview && isApproved && (
          <div className="locked-review-note">
            <CheckCircle2 size={18} />
            <span>Esta solicitud ya fue aprobada. Por ahora no se permite cambiar su estado.</span>
          </div>
        )}

        {isAdmin && onReview && !isApproved && (
          <div className="drawer-review-box">
            <label>
              <span>Comentario de revisión</span>
              <textarea
                rows="4"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Agregue una observación para el personal..."
              />
            </label>
            <div>
              <button className="approve" type="button" onClick={() => handleReview('Aprobada')}>
                <CheckCircle2 size={17} />
                Aprobar
              </button>
              <button className="reject" type="button" onClick={() => handleReview('Rechazada')}>
                <XCircle size={17} />
                Rechazar
              </button>
            </div>
          </div>
        )}

      </aside>
    </div>
  );
}

function RequestHistory({ events }) {
  return (
    <section className="request-history" aria-label="Histórico de la solicitud">
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <span>{formatDateTime(event.createdAt)}</span>
            <i aria-hidden="true"><Info size={13} /></i>
            <div>
              <strong>{event.title}</strong>
              <small>{event.actorName}</small>
              {event.fromStatus && event.toStatus && (
                <em>
                  {event.fromStatus} - {event.toStatus}
                </em>
              )}
              {event.comment && <p>{event.comment}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AttachmentPreview({ attachment }) {
  if (!attachment) {
    return (
      <div className="attachment-preview empty-preview">
        <Paperclip size={28} />
        <strong>Sin comprobante adjunto</strong>
      </div>
    );
  }

  const isImage = attachment.type?.startsWith('image/');
  const isPdf = attachment.type === 'application/pdf' || attachment.name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="attachment-preview">
      <div className="attachment-preview-head">
        <div>
          <span>Comprobante</span>
          <strong>{attachment.name}</strong>
        </div>
        {attachment.dataUrl && (
          <a className="icon-action" href={attachment.dataUrl} target="_blank" rel="noreferrer" aria-label="Abrir comprobante">
            <Eye size={18} />
          </a>
        )}
      </div>
      {attachment.dataUrl && isImage && <img src={attachment.dataUrl} alt={`Comprobante ${attachment.name}`} />}
      {attachment.dataUrl && isPdf && !isImage && <iframe title={`Comprobante ${attachment.name}`} src={attachment.dataUrl} />}
      {(!attachment.dataUrl || (!isImage && !isPdf)) && (
        <div className="empty-preview">
          <Paperclip size={28} />
          <strong>Vista previa no disponible</strong>
          <span>Puede abrirse desde el icono superior si el archivo tiene enlace.</span>
        </div>
      )}
    </div>
  );
}

function MonthlyReport({ month, setMonth, statusFilter, setStatusFilter, rows, onExport, onReview }) {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ id: `empty-${index}`, empty: true })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      return {
        id: date,
        day,
        date,
        requests: rows.filter((request) => request.startDate <= date && request.endDate >= date)
      };
    })
  ];
  const calendarDaysWithRequests = calendarCells.filter((cell) => !cell.empty && cell.requests.length > 0);

  return (
    <section className="panel report-panel">
      <div className="section-heading">
        <div>
          <h3>Resumen mensual</h3>
        </div>
      </div>

      <div className="report-summary">
        <Metric label="Solicitudes" value={rows.length} tone="neutral" />
        <Metric label="Pendientes" value={rows.filter((request) => request.status === 'Pendiente').length} tone="warning" />
        <Metric label="Aprobadas" value={rows.filter((request) => request.status === 'Aprobada').length} tone="success" />
        <Metric label="Rechazadas" value={rows.filter((request) => request.status === 'Rechazada').length} tone="danger" />
      </div>

      <div className="report-filter-panel">
        <div className="report-controls">
          <label>
            <span>Mes</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label>
            <span>Estado</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Todas</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button type="button" className="excel-action" onClick={onExport}>
            <Download size={17} />
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="report-content">
        <div className="report-calendar">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
            <span className="calendar-weekday" key={day}>{day}</span>
          ))}
          {calendarCells.map((cell) =>
            cell.empty ? (
              <div className="calendar-day empty" key={cell.id} />
            ) : (
              <div className="calendar-day" key={cell.id}>
                <strong>{cell.day}</strong>
                <div>
                  {cell.requests.slice(0, 3).map((request) => (
                    <button
                      className={`calendar-event status-${request.status.toLowerCase()}`}
                      key={request.uuid ?? request.id}
                      type="button"
                      onClick={() => setSelectedRequest(request)}
                      title={`Ver detalle de ${request.id}`}
                    >
                      {request.id} · {request.type}
                    </button>
                  ))}
                  {cell.requests.length > 3 && <small>+{cell.requests.length - 3} más</small>}
                </div>
              </div>
            )
          )}
        </div>

        <div className="mobile-calendar-list" aria-label="Solicitudes por fecha">
          {calendarDaysWithRequests.map((cell) => (
            <article className="mobile-calendar-day" key={cell.id}>
              <div className="mobile-calendar-date">
                <strong>{cell.day}</strong>
                <span>{formatDate(cell.date)}</span>
              </div>
              <div className="mobile-calendar-events">
                {cell.requests.map((request) => (
                  <button
                    className="mobile-calendar-event"
                    key={request.uuid ?? request.id}
                    type="button"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <span>{request.id}</span>
                    <strong>{request.type} por {request.category}</strong>
                    <small>{request.personName}</small>
                    <StatusPill status={request.status} />
                  </button>
                ))}
              </div>
            </article>
          ))}
          {calendarDaysWithRequests.length === 0 && <EmptyState />}
        </div>
      </div>
      {selectedRequest && (
        <RequestDetailDrawer
          request={selectedRequest}
          isAdmin
          onClose={() => setSelectedRequest(null)}
          onReview={onReview}
        />
      )}
    </section>
  );
}

function PeopleManagement({ people, currentUserId, onUpdatePerson, onResendConfirmation }) {
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [inlineNotice, setInlineNotice] = useState(null);
  const pendingPeople = people.filter((person) => !person.active).length;
  const activePeople = people.filter((person) => person.active).length;
  const adminPeople = people.filter((person) => person.role === 'admin').length;
  const currentSelectedPerson = selectedPerson ? people.find((person) => person.id === selectedPerson.id) ?? selectedPerson : null;

  async function handlePersonUpdate(person, updates, comment = '') {
    const result = await onUpdatePerson(person.id, updates, comment);
    setInlineNotice({
      ok: Boolean(result?.ok),
      message: result?.message || 'Actualización procesada.'
    });
    return result;
  }

  async function handleTableResend(person) {
    const result = await onResendConfirmation(person);
    setInlineNotice({
      ok: Boolean(result?.ok),
      message: result?.message || 'Solicitud de reenvío procesada.'
    });
  }

  return (
    <section className="panel report-panel">
      <div className="section-heading">
        <div>
          <h3>Personal y accesos</h3>
        </div>
      </div>

      <div className="report-summary">
        <Metric label="Personal" value={people.length} tone="neutral" />
        <Metric label="Activos" value={activePeople} tone="success" />
        <Metric label="Solicitados" value={pendingPeople} tone="warning" />
        <Metric label="Administradores" value={adminPeople} tone="neutral" />
      </div>

      <div className="report-content">
        {inlineNotice?.message && (
          <div className={`notice ${inlineNotice.ok ? 'success' : 'danger'}`} role="status">
            {inlineNotice.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {inlineNotice.message}
          </div>
        )}
        <div className="table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th>Personal</th>
                <th>Rol</th>
                <th>Área</th>
                <th>Cargo</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <Fragment key={person.id}>
                  <tr>
                    <td data-label="Personal">
                      <div className="report-person people-person">
                        <span className={`mini-avatar ${person.active ? 'active' : ''}`}>{getInitials(getEmailDisplayName(person))}</span>
                        <div>
                          <strong>{getEmailDisplayName(person)}</strong>
                          <span>{person.email || 'Correo pendiente de sincronizar'}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Rol">
                      <select
                        value={person.role}
                        onChange={(event) => handlePersonUpdate(person, { role: event.target.value })}
                        disabled={person.id === currentUserId || (!person.active && person.role !== 'admin') || (!person.email_confirmed_at && person.role !== 'admin')}
                        title={
                          person.id === currentUserId
                            ? 'No puede cambiar su propio rol'
                            : !person.active || !person.email_confirmed_at
                              ? 'Primero confirme el correo y apruebe el acceso'
                              : 'Cambiar rol'
                        }
                      >
                        <option value="personal">Personal</option>
                        <option value="admin">Administrador</option>
                      </select>
                      {(!person.active || !person.email_confirmed_at) && person.role !== 'admin' && (
                        <small className="field-hint">Primero aprobar acceso</small>
                      )}
                    </td>
                    <td data-label="Área">
                      <input
                        defaultValue={person.department}
                        onBlur={(event) => handlePersonUpdate(person, { department: event.target.value.trim() || 'Institución' })}
                      />
                    </td>
                    <td data-label="Cargo">
                      <input
                        defaultValue={person.position}
                        onBlur={(event) => handlePersonUpdate(person, { position: event.target.value.trim() || 'Personal' })}
                      />
                    </td>
                    <td data-label="Correo">
                      <span className={`access-pill ${person.email_confirmed_at ? 'verified' : 'unverified'}`}>
                        {person.email_confirmed_at ? 'Verificado' : 'Pendiente'}
                      </span>
                    </td>
                    <td data-label="Estado">
                      <span className={`access-pill ${person.active ? 'active' : 'pending'}`}>
                        {person.active ? 'Activo' : 'Solicitado'}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      <div className="table-action-group">
                        {!person.email_confirmed_at && person.email && (
                          <button
                            className="icon-action"
                            type="button"
                            onClick={() => handleTableResend(person)}
                            aria-label="Reenviar correo de confirmación"
                            title="Reenviar correo"
                          >
                            <Send size={17} />
                          </button>
                        )}
                        <button
                          className={`icon-action ${expandedHistoryId === person.id ? 'active' : ''}`}
                          type="button"
                          onClick={() => setExpandedHistoryId((current) => (current === person.id ? null : person.id))}
                          aria-label="Ver histórico"
                          title="Histórico"
                        >
                          <History size={17} />
                        </button>
                        <button className="secondary-action table-action" type="button" onClick={() => setSelectedPerson(person)}>
                          <Eye size={16} />
                          Ver detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedHistoryId === person.id && (
                    <tr className="history-expand-row">
                      <td colSpan="7">
                        <RequestHistory events={buildProfileHistory(person)} compact />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {people.length === 0 && <EmptyState />}
        </div>
      </div>

      {currentSelectedPerson && (
        <PersonDetailDrawer
          person={currentSelectedPerson}
          currentUserId={currentUserId}
          onClose={() => setSelectedPerson(null)}
          onUpdatePerson={(personId, updates, comment) => handlePersonUpdate(currentSelectedPerson, updates, comment)}
          onResendConfirmation={onResendConfirmation}
        />
      )}
    </section>
  );
}

function PersonDetailDrawer({ person, currentUserId, onClose, onUpdatePerson, onResendConfirmation }) {
  const [comment, setComment] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [drawerNotice, setDrawerNotice] = useState(null);
  const isCurrentUser = person.id === currentUserId;
  const isEmailVerified = Boolean(person.email_confirmed_at);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleAccessChange(active) {
    setDrawerNotice(null);
    setIsUpdating(true);
    const result = await onUpdatePerson(person.id, { active }, comment);
    setIsUpdating(false);

    if (!result?.ok) {
      setDrawerNotice({
        ok: false,
        message: result?.message || 'No se pudo actualizar el acceso.'
      });
      return;
    }

    setComment('');
    onClose();
  }

  async function handleResendConfirmation() {
    setDrawerNotice(null);
    setIsResending(true);
    const result = await onResendConfirmation(person);
    setIsResending(false);
    setDrawerNotice({
      ok: Boolean(result?.ok),
      message: result?.message || 'Solicitud de reenvío procesada.'
    });
  }

  return (
    <div className="detail-drawer-layer" role="presentation">
      <button className="detail-drawer-backdrop" type="button" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className="detail-drawer" aria-label="Detalle de personal">
        <div className="drawer-header">
          <div>
            <span className="request-code">Personal</span>
            <h3>{getEmailDisplayName(person)}</h3>
          </div>
          <button className="icon-action drawer-close-action" type="button" aria-label="Cerrar detalle" onClick={onClose}>
            <XCircle size={22} />
            <span>Volver</span>
          </button>
        </div>

        <span className={`access-pill ${person.active ? 'active' : 'pending'}`}>
          {person.active ? 'Activo' : 'Solicitado'}
        </span>

        <div className="drawer-details">
          <div>
            <span>Correo</span>
            <strong>{person.email || 'Correo pendiente de sincronizar'}</strong>
          </div>
          <div>
            <span>Verificación</span>
            <strong>{isEmailVerified ? 'Correo confirmado' : 'Correo sin confirmar'}</strong>
          </div>
          <div>
            <span>Rol</span>
            <strong>{person.role === 'admin' ? 'Administrador' : 'Personal'}</strong>
          </div>
          <div>
            <span>Área</span>
            <strong>{person.department}</strong>
          </div>
          <div>
            <span>Cargo</span>
            <strong>{person.position}</strong>
          </div>
        </div>

        <div className="drawer-review-box">
          {drawerNotice?.message && (
            <div className={`notice ${drawerNotice.ok ? 'success' : 'danger'}`} role="status">
              {drawerNotice.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              {drawerNotice.message}
            </div>
          )}
          <label>
            <span>Comentario de aprobación</span>
            <textarea
              rows="4"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Agregue una observación para el histórico..."
              disabled={isCurrentUser}
            />
          </label>
          {isCurrentUser ? (
            <div className="locked-review-note">
              <AlertTriangle size={18} />
              <span>No puede modificar el acceso de su propia cuenta desde este panel.</span>
            </div>
          ) : !isEmailVerified && !person.active ? (
            <div className="pending-confirmation-box">
              <div className="locked-review-note">
                <AlertTriangle size={18} />
                <span>Este usuario debe confirmar su correo antes de aprobar el acceso.</span>
              </div>
              {person.email && (
                <button className="secondary-action table-action" type="button" onClick={handleResendConfirmation} disabled={isResending}>
                  <Send size={17} />
                  {isResending ? 'Enviando...' : 'Reenviar correo'}
                </button>
              )}
            </div>
          ) : (
            <div>
              {person.active ? (
                <button className="reject" type="button" onClick={() => handleAccessChange(false)} disabled={isUpdating}>
                  <UserX size={17} />
                  {isUpdating ? 'Actualizando...' : 'Inactivar'}
                </button>
              ) : (
                <button className="approve" type="button" onClick={() => handleAccessChange(true)} disabled={isUpdating}>
                  <UserCheck size={17} />
                  {isUpdating ? 'Aprobando...' : 'Aprobar acceso'}
                </button>
              )}
            </div>
          )}
        </div>

      </aside>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>
      {statusIcon(status)}
      {status}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <ClipboardList size={34} />
      <strong>No hay solicitudes para mostrar</strong>
      <span>Aparecerán aquí cuando se registren o cambien los filtros.</span>
    </div>
  );
}

export default App;
