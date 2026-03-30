import { afterEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from './schema.ts';
import { clearUserProfile, getUserProfile, saveUserProfile } from './user-profile.ts';
import { countAnsweredUserProfileQuestions, formatUserProfileForPrompt } from '../user/profile.ts';

describe('Vault — User Profile', () => {
  afterEach(() => {
    closeDb();
  });

  test('save + load persists normalized answers', () => {
    initDatabase(':memory:');

    const saved = saveUserProfile({
      preferred_name: '  Alex  ',
      interests: 'AI, cars',
      empty_field: '',
    });

    expect(saved.answers.preferred_name).toBe('Alex');
    expect(saved.answers.interests).toBe('AI, cars');
    expect(saved.completed_at).toBeNumber();

    const loaded = getUserProfile();
    expect(loaded?.answers.preferred_name).toBe('Alex');
    expect(loaded?.answers.interests).toBe('AI, cars');
  });

  test('clear removes saved profile', () => {
    initDatabase(':memory:');

    saveUserProfile({ preferred_name: 'Alex' });
    clearUserProfile();

    expect(getUserProfile()).toBeNull();
  });

  test('prompt formatter includes answered fields only', () => {
    initDatabase(':memory:');

    const profile = saveUserProfile({
      preferred_name: 'Alex',
      communication_preferences: 'Be direct and concise.',
    });

    expect(countAnsweredUserProfileQuestions(profile)).toBe(2);

    const prompt = formatUserProfileForPrompt(profile);
    expect(prompt).toContain('Preferred Name: |');
    expect(prompt).toContain('    Alex');
    expect(prompt).toContain('Communication Preferences: |');
    expect(prompt).toContain('    Be direct and concise.');
    expect(prompt).not.toContain('Pronouns');
  });

  test('prompt formatter indents multiline answers to keep them contained', () => {
    initDatabase(':memory:');

    const profile = saveUserProfile({
      anything_else: 'Line one\n# not a heading\n- not a list item',
    });

    const prompt = formatUserProfileForPrompt(profile);
    expect(prompt).toContain('Anything Else: |');
    expect(prompt).toContain('    Line one');
    expect(prompt).toContain('    # not a heading');
    expect(prompt).toContain('    - not a list item');
  });
});
