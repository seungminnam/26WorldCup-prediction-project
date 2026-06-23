type CronAuthInput = {
  authorizationHeader: string | null;
  secret: string | undefined;
};

export function isAuthorizedCronRequest({ authorizationHeader, secret }: CronAuthInput) {
  if (!secret) {
    return false;
  }

  return authorizationHeader === `Bearer ${secret}`;
}
