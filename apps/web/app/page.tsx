import { MatchCentreApp } from "@/components/match-centre/match-centre-app";
import { getTournamentData } from "@/lib/tournament-data";

export const revalidate = 60;

export default async function HomePage() {
  const tournamentData = await getTournamentData();
  return <MatchCentreApp initialData={tournamentData} />;
}
