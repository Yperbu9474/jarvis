import { deleteSetting, getSetting, setSetting } from './settings.ts';
import {
  USER_PROFILE_SETTING_KEY,
  createEmptyUserProfile,
  countAnsweredUserProfileQuestions,
  normalizeUserProfileAnswers,
  type UserProfileRecord,
} from '../user/profile.ts';

export function getUserProfile(): UserProfileRecord | null {
  const raw = getSetting(USER_PROFILE_SETTING_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileRecord>;
    const base = createEmptyUserProfile();
    return {
      version: 1,
      answers: normalizeUserProfileAnswers((parsed.answers ?? {}) as Record<string, unknown>),
      created_at: typeof parsed.created_at === 'number' ? parsed.created_at : base.created_at,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : base.updated_at,
      completed_at: typeof parsed.completed_at === 'number' ? parsed.completed_at : null,
    };
  } catch {
    return null;
  }
}

export function saveUserProfile(input: Record<string, unknown>): UserProfileRecord {
  const existing = getUserProfile();
  const now = Date.now();
  const answers = normalizeUserProfileAnswers(input);
  const profile: UserProfileRecord = {
    version: 1,
    answers,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    completed_at: countAnsweredUserProfileQuestions({
      version: 1,
      answers,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      completed_at: null,
    }) > 0 ? now : null,
  };

  setSetting(USER_PROFILE_SETTING_KEY, JSON.stringify(profile));
  return profile;
}

export function clearUserProfile(): void {
  deleteSetting(USER_PROFILE_SETTING_KEY);
}
