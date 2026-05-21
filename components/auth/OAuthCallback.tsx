import { Redirect } from 'expo-router';

// Android Chrome Custom Tab opens our OAuth redirect URI as a deep link, which
// Expo Router tries to route to (e.g. `/anilist-auth`). Without a matching
// route the user sees the Unmatched Route screen for a frame before the
// in-app auth-session listener resolves. We render thin redirect stubs so
// the user is bounced straight back to the connect screen instead.
export default function OAuthCallback() {
  return <Redirect href="/(setting)/account" />;
}
