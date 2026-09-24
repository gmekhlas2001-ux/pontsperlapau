import { describe, expect, it } from 'vitest';
import { prepareSurveyCreation } from '../../supabase/functions/_shared/survey-create';

const branch = '11111111-1111-1111-1111-111111111111';
const caller = { id: crypto.randomUUID(), role: 'admin', branch_id: branch };
const payload = () => ({
  title: 'Example', status: 'draft', respondentType: 'students',
  sections: [{ title: 'Section' }], questions: [{ text: 'Question', sectionIndex: 0, options: [{ label: 'Yes' }] }],
});
describe('survey creation validation', () => {
  it('assigns stable relationship IDs before insertion and uses the administrator’s branch', () => {
    const data = prepareSurveyCreation({ ...payload(), branchId: crypto.randomUUID() }, caller);
    expect(data.p_fields.branch_id).toBe(branch);
    expect(data.p_questions[0].section_id).toBe(data.p_sections[0].id);
    expect(data.p_options[0].question_id).toBe(data.p_questions[0].id);
  });
  it.each([
    { title: ' ' }, { questions: [] }, { questions: [{ text: 'Question', sectionIndex: 99 }] },
    { questions: [null] }, { surveyDate: '2026-02-31' }, { surveyCode: 'T1' },
    { questions: [{ text: 'Question', options: [{ label: ' ' }] }] },
    { respondentIds: [{ type: 'staff', id: crypto.randomUUID() }] },
  ])('rejects malformed structure before any write: %j', invalid => {
    expect(() => prepareSurveyCreation({ ...payload(), ...invalid }, caller)).toThrow();
  });
  it('rejects duplicate selected respondents instead of silently skipping them', () => {
    const row = { type: 'student', id: crypto.randomUUID() };
    expect(() => prepareSurveyCreation({ ...payload(), respondentIds: [row, row] }, caller)).toThrow(/more than once/);
  });
  it('preserves optional questions, legacy shared scales, and MD5-based cycle IDs', () => {
    const data = prepareSurveyCreation({ ...payload(), surveyCode: 'T2', reportingCycleId: '3548c98d-a07e-8c64-cd7a-95fd08b1c9ef', questions: [{ text: 'Question', required: false }], options: [{ label: 'Yes' }] }, caller);
    expect(data.p_questions[0].required).toBe(false);
    expect(data.p_options[0].question_id).toBeNull();
  });
});
