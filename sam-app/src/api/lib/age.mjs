export const MIN_SELF_CONSENT_AGE = Number(process.env.MIN_SELF_CONSENT_AGE || 18);

export const computeAge = (birthDate) => {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};

export const ageFromRecord = (user) => {
  if (typeof user?.age === "number") return user.age;
  return user?.birthDate ? computeAge(user.birthDate) : null;
};
