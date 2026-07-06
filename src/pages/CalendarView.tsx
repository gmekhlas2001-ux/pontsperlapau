/**
 * Calendar View
 *
 * Shows all scheduled classes as events on a week/month/day calendar.
 * Uses react-big-calendar with the date-fns localizer.
 *
 * Classes with schedule_days + schedule_time are expanded into recurring
 * events for the visible date window. Classes without times appear as
 * all-day events on each scheduled day-of-week.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { enUS, es, ca, fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, CalendarDays, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { getClassesList } from '@/services/classService';
import type { ClassRecord as ClassItem } from '@/services/classService';

// ─── localizer ────────────────────────────────────────────────────────────────

const locales = { 'en-US': enUS, 'es': es, 'ca': ca, 'fr': fr };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ─── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#0d9488', '#2563eb', '#7c3aed', '#db2777',
  '#ea580c', '#16a34a', '#ca8a04', '#0891b2',
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Expand a single class into calendar events for the given [start, end] window */
function expandClass(cls: ClassItem, windowStart: Date, windowEnd: Date, color: string) {
  const events: CalendarEvent[] = [];
  if (!cls.scheduleDays || cls.scheduleDays.length === 0) return events;

  let cursor = new Date(windowStart);
  cursor.setHours(0, 0, 0, 0);
  const winEnd = new Date(windowEnd);
  winEnd.setHours(23, 59, 59, 999);

  while (cursor <= winEnd) {
    const dayName = DAY_NAMES[cursor.getDay()];
    if (cls.scheduleDays.map((d) => d.toLowerCase()).includes(dayName)) {
      let start: Date;
      let end: Date;
      let allDay = false;

      if (cls.scheduleTime) {
        const [sh, sm] = cls.scheduleTime.split(':').map(Number);
        start = new Date(cursor);
        start.setHours(sh, sm, 0, 0);

        if (cls.scheduleEndTime) {
          const [eh, em] = cls.scheduleEndTime.split(':').map(Number);
          end = new Date(cursor);
          end.setHours(eh, em, 0, 0);
        } else {
          end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h
        }
      } else {
        start = new Date(cursor);
        end = new Date(cursor);
        allDay = true;
      }

      events.push({
        id: `${cls.id}-${cursor.toISOString()}`,
        title: cls.name,
        start,
        end,
        allDay,
        resource: { cls, color },
      });
    }
    cursor = addDays(cursor, 1);
  }
  return events;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: { cls: ClassItem; color: string };
}

// ─── Event tooltip/detail dialog ──────────────────────────────────────────────

function EventDetail({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!event) return null;
  const { cls } = event.resource;
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: event.resource.color }}
            />
            {cls.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {cls.description && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="w-4 h-4" />
              <span>{cls.description}</span>
            </div>
          )}
          {!event.allDay && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                {format(event.start, 'HH:mm')} – {format(event.end, 'HH:mm')}
              </span>
            </div>
          )}
          {(cls.teacherFirstName || cls.teacherLastName) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{cls.teacherFirstName} {cls.teacherLastName}</span>
            </div>
          )}
          {cls.scheduleDays && cls.scheduleDays.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {cls.scheduleDays.map((d) => (
                <Badge key={d} variant="secondary" className="capitalize">{d}</Badge>
              ))}
            </div>
          )}
          {cls.location && (
            <p className="text-muted-foreground">{t('calendar.room')}: {cls.location}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CalendarView() {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<(typeof Views)[keyof typeof Views]>(Views.WEEK);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setLoading(true);
    getClassesList().then((res) => {
      setLoading(false);
      if (res.success && res.data) setClasses(res.data);
      else toast.error(t('calendar.errors.load'));
    });
  }, [t]);

  // Build window for event expansion
  const window = useMemo(() => {
    if (view === Views.MONTH) {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return { start: addDays(start, -7), end: addDays(end, 7) };
    }
    // Week or day — ±14 days around currentDate is plenty
    return { start: addDays(currentDate, -14), end: addDays(currentDate, 14) };
  }, [currentDate, view]);

  const events = useMemo(() => {
    const all: CalendarEvent[] = [];
    classes.forEach((cls, i) => {
      const color = PALETTE[i % PALETTE.length];
      all.push(...expandClass(cls, window.start, window.end, color));
    });
    return all;
  }, [classes, window]);

  const eventStyleGetter = (event: CalendarEvent) => ({
    style: {
      backgroundColor: event.resource.color,
      border: 'none',
      borderRadius: '4px',
      color: '#fff',
      fontSize: '12px',
    },
  });

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('calendar.title')}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{t('calendar.subtitle')}</p>
      </div>

      {/* Legend */}
      {classes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {classes.slice(0, 12).map((cls, i) => (
            <div key={cls.id} className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="text-muted-foreground">{cls.name}</span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-2 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : (
            <div style={{ height: 640 }}>
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                view={view}
                onView={(v: (typeof Views)[keyof typeof Views]) => setView(v)}
                date={currentDate}
                onNavigate={(d: Date) => setCurrentDate(d)}
                onSelectEvent={(event: object) => setSelectedEvent(event as CalendarEvent)}
                eventPropGetter={eventStyleGetter}
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                messages={{
                  today: t('calendar.today'),
                  previous: t('calendar.prev'),
                  next: t('calendar.next'),
                  month: t('calendar.month'),
                  week: t('calendar.week'),
                  day: t('calendar.day'),
                  agenda: t('calendar.agenda'),
                  noEventsInRange: t('calendar.noEvents'),
                  showMore: (count: number) => `+${count} ${t('calendar.more')}`,
                }}
                popup
              />
            </div>
          )}
        </CardContent>
      </Card>

      <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
