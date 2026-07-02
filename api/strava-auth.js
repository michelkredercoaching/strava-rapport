export default function handler(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = 'https://rapport.michelkredercoaching.nl/api/strava-callback';

  // scope:
  //   activity:read_all → ritten + streams (FTP, zones, VO2max)
  //   profile:read_all  → athlete.weight, voor de W/kg-berekening
  const scope = 'activity:read_all,profile:read_all';

  const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=force&scope=${encodeURIComponent(scope)}`;

  res.redirect(stravaUrl);
}
