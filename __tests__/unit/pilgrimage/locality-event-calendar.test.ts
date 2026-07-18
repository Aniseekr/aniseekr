import { describe, expect, it } from 'bun:test';

import { getLocalityEventListRows } from '../../../libs/services/pilgrimage/locality/event-detail';
import { mapLocalityEventRowsByDay } from '../../../libs/services/pilgrimage/locality/event-calendar';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';

describe('canonical locality event calendar', () => {
  it('PILG-059 maps only real upcoming and confirmed occurrence dates into the month', () => {
    const rows = getLocalityEventListRows(new Date('2026-07-18T00:00:00.000Z'), localityRepository);

    const july = mapLocalityEventRowsByDay(rows, { year: 2026, month: 7 });
    const october = mapLocalityEventRowsByDay(rows, { year: 2026, month: 10 });

    expect(july.get('2026-07-19')?.map((row) => String(row.event.id))).toEqual([
      'yuwaku-bonbori-lighting-2026',
    ]);
    expect(october.get('2026-10-17')?.map((row) => String(row.event.id))).toEqual([
      'yuwaku-bonbori-matsuri',
    ]);
    expect(
      [...july.values(), ...october.values()]
        .flat()
        .some((row) => row.event.schedule.kind === 'ongoing')
    ).toBe(false);
  });

  it('PILG-059 clips an active canonical date window to each requested month', () => {
    const rows = getLocalityEventListRows(new Date('2026-03-20T00:00:00.000Z'), localityRepository);

    const march = mapLocalityEventRowsByDay(rows, { year: 2026, month: 3 });
    const april = mapLocalityEventRowsByDay(rows, { year: 2026, month: 4 });

    expect(march.size).toBe(21);
    expect(String(march.get('2026-03-11')?.[0]?.event.id)).toBe(
      'watakon-chiyoda-sakura-stamp-2026'
    );
    expect(String(march.get('2026-03-31')?.[0]?.event.id)).toBe(
      'watakon-chiyoda-sakura-stamp-2026'
    );
    expect(march.has('2026-04-01')).toBe(false);

    expect(april.size).toBe(22);
    expect(String(april.get('2026-04-01')?.[0]?.event.id)).toBe(
      'watakon-chiyoda-sakura-stamp-2026'
    );
    expect(String(april.get('2026-04-22')?.[0]?.event.id)).toBe(
      'watakon-chiyoda-sakura-stamp-2026'
    );
    expect(april.has('2026-04-23')).toBe(false);
  });
});
