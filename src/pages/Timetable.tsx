/**
 * Timetable page.
 *
 * Renders a weekly schedule grid (Sunday–Saturday) derived from each class's
 * `schedule_day` array and `schedule_time` / `schedule_end_time` fields.
 *
 * Teachers see only their own classes.
 * Admins and superadmins see all active classes, optionally filtered by teacher.
 *
 * Clicking a class card opens a detail popover showing teacher, location,
 * capacity, branch, and academic year.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClassesList, type ClassRecord } from '@/services/classService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { RefreshCw, Calendar, Clock, MapPin, Users, BookOpen, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string; short: string }[] = [
  { key: 'sunday',    label: 'Sunday',    short: 'Sun' },
  { key: 'monday',    label: 'Monday',    short: 'Mon' },
  { key: 'tuesday',   label: 'Tuesday',   short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday',  label: 'Thursday',  short: 'Thu' },
  { key: 'friday',    label: 'Friday',    short: 'Fri' },
  { key: 'saturday',  label: 'Saturday',  short: 'Sat' },
];

/** Time-slot rows shown in the grid (every 30 min, 07:00–20:00). */
const TIME_SLOTS: string[] = [];
for (let h = 7; h < 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('20:00');

/** Convert "HH:MM" to minutes since midnight. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const GRID_START = toMinutes('07:00');
const SLOT_HEIGHT_PX = 32; // height of each 30-min slot in px
const SLOT_MINUTES = 30;

/** Distinct teal/purple/blue/amber palette for classes. */
const PALETTE = [
  'bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-200',
  'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200',
  'bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-200',
  'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200',
  'bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-200',
  'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200',
  'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-200',
  'bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-900/40 dark:border-cyan-700 dark:text-cyan-200',
];

// ─── Class block ─────────────────────────────────────────────────────────────

function ClassBlock({
  cls,
  colorClass,
}: {
  cls: ClassRecord;
  colorClass: string;
}) {
  const start = cls.scheduleTime ? toMinutes(cls.scheduleTime) : null;
  const end   = cls.scheduleEndTime ? toMinutes(cls.scheduleEndTime) : null;

  const top    = start !== null ? ((start - GRID_START) / SLOT_MINUTES) * SLOT_HEIGHT_PX : 0;
  const height = start !== null && end !== null && end > start
    ? ((end - start) / SLOT_MINUTES) * SLOT_HEIGHT_PX
    : SLOT_HEIGHT_PX * 2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 cursor-pointer overflow-hidden',
            'hover:brightness-95 dark:hover:brightness-110 transition-all select-none',
            colorClass,
          )}
          style={{ top, height: Math.max(height, 28) }}
        >
          <p className="font-semibold text-[11px] leading-tight truncate">{cls.name}</p>
          {height >= 52 && (
            <p className="text-[10px] opacity-70 truncate mt-0.5">
              {cls.teacherFirstName} {cls.teacherLastName}
            </p>
          )}
          {height >= 72 && cls.scheduleTime && (
            <p className="text-[10px] opacity-60 mt-0.5">
              {cls.scheduleTime}{cls.scheduleEndTime ? `–${cls.scheduleEndTime}` : ''}
            </p>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" side="right" align="start">
        <div>
          <h3 className="font-bold text-base">{cls.name}</h3>
          {cls.description && <p className="text-sm text-muted-foreground mt-0.5">{cls.description}</p>}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{cls.teacherFirstName} {cls.teacherLastName}</span>
          </div>
          {cls.scheduleTime && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {cls.scheduleTime}
                {cls.scheduleEndTime && ` – ${cls.scheduleEndTime}`}
              </span>
            </div>
          )}
          {cls.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{cls.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Max {cls.maxCapacity} students</span>
          </div>
          {cls.academicYear && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{cls.academicYear}{cls.semester ? ` · ${cls.semester}` : ''}</span>
            </div>
          )}
          {cls.branchName && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{cls.branchName}</span>
            </div>
          )}
        </div>
        <div className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium border', colorClass)}>
          {cls.status}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── List view (fallback when no times set) ───────────────────────────────────

function ListView({
  classesByDay,
  colorMap,
}: {
  classesByDay: Record<string, ClassRecord[]>;
  colorMap: Map<string, string>;
}) {
  const activeDays = DAYS.filter((d) => (classesByDay[d.key] ?? []).length > 0);

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Calendar className="h-12 w-12 mb-3 opacity-20" />
        <p className="font-medium">No scheduled classes found</p>
        <p className="text-sm mt-1">Assign schedule days to classes on the Classes page.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
      {activeDays.map((day) => (
        <Card key={day.key}>
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="font-semibold text-sm">{day.label}</p>
          </div>
          <CardContent className="p-3 space-y-2">
            {(classesByDay[day.key] ?? []).map((cls) => (
              <Popover key={cls.id}>
                <PopoverTrigger asChild>
                  <div className={cn('rounded-lg border px-3 py-2 cursor-pointer hover:brightness-95 transition-all', colorMap.get(cls.id) ?? PALETTE[0])}>
                    <p className="font-semibold text-xs">{cls.name}</p>
                    <p className="text-[11px] opacity-70 mt-0.5">{cls.teacherFirstName} {cls.teacherLastName}</p>
                    {cls.scheduleTime && (
                      <p className="text-[11px] opacity-60 mt-0.5">
                        {cls.scheduleTime}{cls.scheduleEndTime ? `–${cls.scheduleEndTime}` : ''}
                      </p>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 space-y-2 text-sm" side="right">
                  <p className="font-bold">{cls.name}</p>
                  {cls.location && <p className="text-muted-foreground"><MapPin className="inline h-3 w-3 mr-1" />{cls.location}</p>}
                  {cls.scheduleTime && <p className="text-muted-foreground"><Clock className="inline h-3 w-3 mr-1" />{cls.scheduleTime}{cls.scheduleEndTime ? `–${cls.scheduleEndTime}` : ''}</p>}
                  <p className="text-muted-foreground"><Users className="inline h-3 w-3 mr-1" />Max {cls.maxCapacity}</p>
                </PopoverContent>
              </Popover>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Weekly grid view ─────────────────────────────────────────────────────────

function GridView({
  classesByDay,
  colorMap,
  activeDays,
}: {
  classesByDay: Record<string, ClassRecord[]>;
  colorMap: Map<string, string>;
  activeDays: typeof DAYS;
}) {
  const totalSlots = TIME_SLOTS.length;
  const gridH = totalSlots * SLOT_HEIGHT_PX;

  return (
    <div className="overflow-x-auto p-4">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div
          className="grid border-b bg-muted/30"
          style={{ gridTemplateColumns: `60px repeat(${activeDays.length}, 1fr)` }}
        >
          <div className="p-2 text-xs text-muted-foreground" />
          {activeDays.map((d) => (
            <div key={d.key} className="p-2 text-center text-xs font-semibold border-l">
              {d.label}
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `60px repeat(${activeDays.length}, 1fr)`, height: gridH }}
        >
          {/* Time labels column */}
          <div className="relative border-r">
            {TIME_SLOTS.map((t, i) => (
              <div
                key={t}
                className="absolute left-0 right-0 text-right pr-2"
                style={{ top: i * SLOT_HEIGHT_PX - 7 }}
              >
                {t.endsWith(':00') ? (
                  <span className="text-[10px] text-muted-foreground font-mono">{t}</span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {activeDays.map((day) => (
            <div key={day.key} className="relative border-l">
              {/* Horizontal grid lines */}
              {TIME_SLOTS.map((t, i) => (
                <div
                  key={t}
                  className={cn('absolute left-0 right-0 border-t', t.endsWith(':00') ? 'border-border/50' : 'border-border/20')}
                  style={{ top: i * SLOT_HEIGHT_PX }}
                />
              ))}
              {/* Class blocks */}
              {(classesByDay[day.key] ?? []).map((cls) => (
                <ClassBlock key={cls.id} cls={cls} colorClass={colorMap.get(cls.id) ?? PALETTE[0]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Timetable() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    const res = await getClassesList();
    if (res.success && res.data) {
      const all = res.data.filter((c) => c.status === 'active');
      const scoped = user?.role === 'teacher'
        ? all.filter((c) => c.teacherId === user.id)
        : all;
      setClasses(scoped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // Assign stable colors per class
  const colorMap = new Map<string, string>();
  classes.forEach((cls, i) => {
    colorMap.set(cls.id, PALETTE[i % PALETTE.length]);
  });

  // Unique teachers for filter
  const teachers = Array.from(
    new Map(classes.map((c) => [`${c.teacherId}`, { id: c.teacherId, name: `${c.teacherFirstName} ${c.teacherLastName}` }])).values()
  );

  const filtered = filterTeacher === 'all'
    ? classes
    : classes.filter((c) => c.teacherId === filterTeacher);

  // Pivot: day → classes
  const classesByDay: Record<string, ClassRecord[]> = {};
  for (const cls of filtered) {
    for (const day of cls.scheduleDays) {
      if (!classesByDay[day]) classesByDay[day] = [];
      classesByDay[day].push(cls);
    }
  }

  // Sort each day's classes by start time
  for (const day of Object.keys(classesByDay)) {
    classesByDay[day].sort((a, b) => {
      const ta = a.scheduleTime ? toMinutes(a.scheduleTime) : 0;
      const tb = b.scheduleTime ? toMinutes(b.scheduleTime) : 0;
      return ta - tb;
    });
  }

  // Only show days that have at least one class
  const activeDays = DAYS.filter((d) => (classesByDay[d.key] ?? []).length > 0);

  // If no class has a time set, fall back to list view automatically
  const hasTimedClasses = filtered.some((c) => c.scheduleTime);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Timetable
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Weekly schedule for all active classes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role !== 'teacher' && teachers.length > 1 && (
            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teachers</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-0 px-3"
              onClick={() => setViewMode('grid')}
              disabled={!hasTimedClasses}
            >
              Grid
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-0 border-l px-3"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={fetchClasses} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b overflow-x-auto bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium shrink-0">Classes:</p>
          {filtered.map((cls, i) => (
            <span
              key={cls.id}
              className={cn('text-xs px-2 py-0.5 rounded-full border font-medium shrink-0', PALETTE[i % PALETTE.length])}
            >
              {cls.name}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
            <Calendar className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">No active classes found</p>
            <p className="text-sm mt-1">Create classes and assign schedule days to see the timetable.</p>
          </div>
        ) : !hasTimedClasses || viewMode === 'list' ? (
          <ListView classesByDay={classesByDay} colorMap={colorMap} />
        ) : (
          <GridView classesByDay={classesByDay} colorMap={colorMap} activeDays={activeDays} />
        )}
      </div>
    </div>
  );
}
