import { describe, expect, test } from 'vitest';
import { addDays, computeAuto, currentValue, pace, stepDate, upcomingSteps, type PlanGoal } from '../model';
import { contactKind, kindFromRole, roleLine } from '../../contacts/roles';

const goal = (o: Partial<PlanGoal>): PlanGoal => ({
  id: 'g', axis: 'live', title: 't', metric: 'manual', unit: 'dates', baseline: 0, target: 20,
  start_date: '2027-01-01', deadline: '2027-12-31', notes: null, archived_at: null, created_at: '2027-01-01', ...o,
});

describe('plan', () => {
  test('dates relative to the target', () => {
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(stepDate({ target_date: '2027-05-15' }, { offset_days: -56 })).toBe('2027-03-20');
  });

  test('auto metrics from deals', () => {
    const data = {
      deals: [
        { stage: 'termine', concert_date: '2027-02-10', fee: 300, first_contact_at: '2026-11-01', created_at: '2026-11-01', venue: { city: 'Lyon', type: 'salle' } },
        { stage: 'confirme', concert_date: '2027-06-10', fee: 500, first_contact_at: '2027-01-05', created_at: '2027-01-05', venue: { city: 'Grenoble', type: 'festival' } },
        { stage: 'refuse', concert_date: null, fee: null, first_contact_at: '2027-01-10', created_at: '2027-01-10', venue: null },
        { stage: 'contacte', concert_date: null, fee: null, first_contact_at: '2027-01-12', created_at: '2027-01-12', venue: null },
      ],
      contacts: [],
    };
    const c = (m: string) => computeAuto(m, data, '2027-01-01', '2027-12-31', '2027-04-01');
    expect(c('auto:dates_jouees')).toBe(1);
    expect(c('auto:dates_confirmees')).toBe(2);
    expect(c('auto:hors_lyon')).toBe(1);
    expect(c('auto:festivals')).toBe(1);
    expect(c('auto:cachets')).toBe(800);
    expect(c('auto:cachet_moyen')).toBe(400);
    expect(c('auto:demarches')).toBe(3);
    expect(c('auto:taux_reponse')).toBe(67);
  });

  test('pace against a straight line', () => {
    const g = goal({});
    expect(pace(g, 10, '2027-07-01').state).toBe('on_track');
    expect(pace(g, 2, '2027-07-01').state).toBe('behind');
    expect(pace(g, 16, '2027-07-01').state).toBe('ahead');
    expect(pace(g, 20, '2027-07-01').state).toBe('done');
    expect(pace(g, 5, '2028-01-05').state).toBe('missed');
  });

  test('manual value = latest reading', () => {
    const g = goal({ metric: 'manual', baseline: 800 });
    const empty = { deals: [], contacts: [] };
    expect(currentValue(g, [], empty, '2027-03-01')).toBe(800);
    expect(currentValue(g, [{ id: '1', goal_id: 'g', value: 900, measured_at: '2027-02-01' }, { id: '2', goal_id: 'g', value: 1200, measured_at: '2027-03-01' }], empty, '2027-03-01')).toBe(1200);
  });

  test('upcoming steps skip done and far ones', () => {
    const p = { id: 'p', title: 'EP', template: null, target_date: '2027-03-01', notes: null, archived_at: null, created_at: '' };
    const steps = [
      { id: 'a', project_id: 'p', title: 'late', phase: null, offset_days: -30, done_at: null, notes: null },
      { id: 'b', project_id: 'p', title: 'done', phase: null, offset_days: -25, done_at: 'x', notes: null },
      { id: 'c', project_id: 'p', title: 'far', phase: null, offset_days: 0, done_at: null, notes: null },
    ];
    expect(upcomingSteps([p], steps, '2027-02-05').map((x) => x.step.id)).toEqual(['a']);
  });
});

describe('contact roles', () => {
  test('guessed from the title', () => {
    expect(kindFromRole('Directeur / Programmateur')).toBe('programmateur');
    expect(kindFromRole('Association programmatrice')).toBe('promoteur');
    expect(kindFromRole('Booking')).toBe('booker');
    expect(kindFromRole('Producteur / label')).toBe('label');
    expect(kindFromRole('Co-gérant / Directeur artistique')).toBe('programmateur');
    expect(kindFromRole('Président / Programmateur')).toBe('programmateur');
    expect(kindFromRole('Direction')).toBe('direction');
    expect(kindFromRole('Accompagnateur')).toBe('accompagnement');
    expect(kindFromRole('Contact')).toBeNull();
  });
  test('saved kind wins, else role, else venue type', () => {
    expect(contactKind({ kind: 'manager', role: 'Programmateur' })).toEqual({ kind: 'manager', sure: true });
    expect(contactKind({ role: 'Contact', venue: { type: 'festival' } })).toEqual({ kind: 'organisateur', sure: false });
    expect(roleLine({ kind: 'programmateur', role: 'Programmateur' })).toBe('Programmateur·rice');
    expect(roleLine({ kind: 'direction', role: 'Directeur / Programmateur' })).toBe('Direction · Directeur / Programmateur');
  });
});
