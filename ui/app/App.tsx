import { PageLayout } from "@dynatrace/strato-components/layouts";
import React, { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Header } from "./components/Header";
import { SideNav } from "./components/SideNav";
import { TopBar } from "./components/TopBar";
import { DeployBanner } from "./components/DeployBanner";
import { SetupBanner } from "./components/SetupBanner";
import { Setup } from "./pages/Setup";
import { FlowStatusProvider } from "./lib/config/FlowStatus";
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

const WELCOMED_KEY = "severity-assistant.welcomed";

/** The first visit in a browser lands on the setup; after that, straight to the rules. */
const Landing = () => {
  let first = false;
  try {
    first = !window.localStorage.getItem(WELCOMED_KEY);
    if (first) window.localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    // Storage unavailable: behave like a returning visitor.
  }
  return <Navigate to={first ? "/setup" : "/rules"} replace />;
};

const GATE_KEY = "severity-assistant.profile-gate";

/** With two or more profiles, the first visit of a session lands on the Profiles tab so the user
 * chooses what to work on instead of silently editing whichever was used last. */
const ProfileGate = () => {
  const navigate = useNavigate();
  const { registry } = useSharedRegistry();
  const { profiles } = useProfiles();
  useEffect(() => {
    if (!registry || profiles.length < 2) return;
    try {
      if (window.sessionStorage.getItem(GATE_KEY)) return;
      window.sessionStorage.setItem(GATE_KEY, "1");
    } catch {
      return;
    }
    navigate("/profiles", { replace: true });
  }, [registry, profiles.length, navigate]);
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
