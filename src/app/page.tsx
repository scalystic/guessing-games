import { getCurrentUser } from "@/lib/get-current-user";
import Home from "./home-client";

export default async function Page() {
  const user = await getCurrentUser();
  return <Home user={user} />;
}
