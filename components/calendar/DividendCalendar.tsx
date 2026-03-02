'use client';

import { useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core';
import type { DividendCalendarEvent } from '@/types/dividend';
import { DividendEventPopover } from './DividendEventPopover';
import { useDividendCalendar } from '@/hooks/useDividendCalendar';
import { Skeleton } from '@/components/ui/skeleton';

export function DividendCalendar() {
  const { events, loading, fetchEvents } = useDividendCalendar();
  const [selectedEvent, setSelectedEvent] = useState<DividendCalendarEvent | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const handleDatesSet = (arg: DatesSetArg) => {
    fetchEvents(arg.start, arg.end);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const event = events.find((e) => e.id === arg.event.id) ?? null;
    setSelectedEvent(event);
  };

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center">
          <Skeleton className="h-8 w-32" />
        </div>
      )}

      <div className="[&_.fc]:font-sans [&_.fc-event]:cursor-pointer">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek',
          }}
          locale="ko"
          height="auto"
          eventTimeFormat={{ hour: undefined, minute: undefined, meridiem: false }}
        />
      </div>

      <DividendEventPopover
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
