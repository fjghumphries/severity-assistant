import { PageLayout } from "@dynatrace/strato-components/layouts";
import React, { useEffect, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Header } from "./components/Header";
import { SideNav } from "./components/SideNav";
import { TopBar } from "./components/TopBar";
import { DeployBanner } from "./components/DeployBanner";
import { SetupBanner } from "./components/SetupBanner";
import { Setup } from "./pages/Setup";
import { FlowStatusProvider } from "./lib/config/FlowStatus";
import { needsSetup } from "./lib/config/firstRun";
import {
  ProfileProvider,
  useProfileId,
  useProfiles,
  useSharedRegistry,
} from "./lib/config/ProfileContext";
import { GettingStarted } from "./pages/GettingStarted";
import { Profiles } from "./pages/Profiles";
import { Rules } from "./pages/Rules";
import { Results } from "./pages/Results";
import { Pipeline } from "./pages/Pipeline";
import { Settings } from "./pages/Settings";

/** Rules and Pipeline hold local edit state, so they are remounted when the profile changes. */
const RulesForProfile = () => <Rules key={useProfileId()} />;
const PipelineForProfile = () => <Pipeline key={useProfileId()} />;

const LANDED_KEY = "severity-assistant.landed";

/** Opening the app lands on the setup while no label is usable (derived from stored data, so a
 * reinstall or a new tenant behaves like a first run), once per browser session so skipping the
 * setup does not trap anyone; everyone else goes straight to the rules. */
const Landing = () => {
  const { registry, isLoading } = useSharedRegistry();
  if (isLoading) return null;
  let toSetup = false;
  try {
    toSetup =
      needsSetup(registry) && !window.sessionStorage.getItem(LANDED_KEY);
    window.sessionStorage.setItem(LANDED_KEY, "1");
  } catch {
    // Storage unavailable: behave like a returning visitor.
  }
  return <Navigate to={toSetup ? "/setup" : "/rules"} replace />;
};

const GATE_KEY = "severity-assistant.profile-gate";

/** With two or more profiles, the first visit of a session lands on the Profiles tab so the user
 * chooses what to work on instead of silently editing whichever was used last. */
const ProfileGate = () => {
  const navigate = useNavigate();
  // Only the app's own entry ("/"): a link opened in a new tab (a deep link such as the Help notes)
  // must land where it points, not on Profiles because the tab's session storage is empty.
  const enteredAtRoot = useRef(useLocation().pathname === "/").current;
  const { registry } = useSharedRegistry();
  const { profiles } = useProfiles();
  useEffect(() => {
    if (!enteredAtRoot || !registry || profiles.length < 2) return;
    try {
      if (window.sessionStorage.getItem(GATE_KEY)) return;
      window.sessionStorage.setItem(GATE_KEY, "1");
    } catch {
      return;
    }
    navigate("/profiles", { replace: true });
  }, [enteredAtRoot, registry, profiles.length, navigate]);
  return null;
};

export const App = () => {
  return (
    <ProfileProvider>
      <FlowStatusProvider>
        <PageLayout>
          <PageLayout.Header>
            <Header />
          </PageLayout.Header>
          {/* The one place the app's structure is shown. Collapses on narrow windows. */}
          <PageLayout.Sidebar defaultWidth={240} minWidth={200} maxWidth={320}>
            <SideNav />
          </PageLayout.Sidebar>
          <PageLayout.Content>
            {/* Tables, tiles and charts want the width; only running text needs a readable measure,
                and that is capped where the text is (PageHeader), not here. The cap below only
                matters on ultra-wide monitors. */}
            <div style={{ maxWidth: 1760, margin: "0 auto", width: "100%" }}>
              <ProfileGate />
              <TopBar />
              <SetupBanner />
              <DeployBanner />
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/profiles" element={<Profiles />} />
                <Route path="/rules" element={<RulesForProfile />} />
                <Route path="/results" element={<Results />} />
                <Route
                  path="/events"
                  element={<Navigate to="/results" replace />}
                />
                <Route
                  path="/history"
                  element={<Navigate to="/results" replace />}
                />
                <Route path="/pipeline" element={<PipelineForProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/help" element={<GettingStarted />} />
                <Route
                  path="/getting-started"
                  element={<Navigate to="/help" replace />}
                />
              </Routes>
            </div>
          </PageLayout.Content>
        </PageLayout>
      </FlowStatusProvider>
    </ProfileProvider>
  );
};
