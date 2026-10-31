import React, { Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Redirect,
  Route as RouterRoute,
  Switch
} from "react-router-dom";
import { ToastContainer } from "react-toastify";

import { AuthProvider } from "../context/Auth/AuthContext";
import { TicketsContextProvider } from "../context/Tickets/TicketsContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import BackdropLoading from "../components/BackdropLoading";
import ChunkErrorBoundary from "../components/ChunkErrorBoundary";
import lazyWithReload from "../helpers/lazyWithReload";
import { isSupplierPortal } from "../helpers/supplierPortal";
import Route from "./Route";
import PartnerRoutes from "./PartnerRoutes";

// import Companies from "../pages/Companies/";
const LoggedInLayout = lazyWithReload(() => import("../layout"));
const Dashboard = lazyWithReload(() => import("../pages/Dashboard/"));
const Sga = lazyWithReload(() => import("../pages/Sga"));
const SgaBilling = lazyWithReload(() => import("../pages/SgaBilling"));
const TicketResponsiveContainer = lazyWithReload(
  () => import("../pages/TicketResponsiveContainer")
);
const Signup = lazyWithReload(() => import("../pages/Signup/"));
const Login = lazyWithReload(() => import("../pages/Login/"));
const MobileLogin = lazyWithReload(() => import("../pages/MobileLogin"));
const Connections = lazyWithReload(() => import("../pages/Connections/"));
const SettingsCustom = lazyWithReload(() => import("../pages/SettingsCustom/"));
const Financeiro = lazyWithReload(() => import("../pages/Financeiro/"));
const CentralCobranca = lazyWithReload(
  () => import("../pages/CentralCobranca/")
);
const Prospeccao = lazyWithReload(() => import("../pages/Prospeccao/"));
const Users = lazyWithReload(() => import("../pages/Users"));
const Contacts = lazyWithReload(() => import("../pages/Contacts/"));
const Queues = lazyWithReload(() => import("../pages/Queues/"));
const Tags = lazyWithReload(() => import("../pages/Tags/"));
const ChatGPT = lazyWithReload(() => import("../pages/ChatGPT/"));
const Helps = lazyWithReload(() => import("../pages/Helps/"));
const ContactLists = lazyWithReload(() => import("../pages/ContactLists/"));
const ContactListItems = lazyWithReload(
  () => import("../pages/ContactListItems/")
);
const QuickMessages = lazyWithReload(() => import("../pages/QuickMessages/"));
const Schedules = lazyWithReload(() => import("../pages/Schedules"));
const Campaigns = lazyWithReload(() => import("../pages/Campaigns"));
const CampaignsConfig = lazyWithReload(
  () => import("../pages/CampaignsConfig")
);
const CampaignReport = lazyWithReload(() => import("../pages/CampaignReport"));
const Annoucements = lazyWithReload(() => import("../pages/Annoucements"));
const Chat = lazyWithReload(() => import("../pages/Chat"));
const ToDoList = lazyWithReload(() => import("../pages/ToDoList/"));
const Subscription = lazyWithReload(() => import("../pages/Subscription/"));
const PlatformAccess = lazyWithReload(() => import("../pages/PlatformAccess"));
const PlatformActivation = lazyWithReload(
  () => import("../pages/PlatformActivation")
);
const SupplierAccess = lazyWithReload(() => import("../pages/SupplierAccess"));
const Fluxos = lazyWithReload(() => import("../pages/Fluxos"));

const Routes = () => {
  const supplierPortal = isSupplierPortal();
  const [showCampaigns, setShowCampaigns] = useState(false);

  useEffect(() => {
    const cshow = localStorage.getItem("cshow");
    if (cshow !== undefined) {
      setShowCampaigns(true);
    }
  }, []);

  return (
    <BrowserRouter>
      <Switch>
        {/* Fica fora do AuthProvider, entao precisa dos proprios limites. */}
        <RouterRoute
          path="/login/mobile"
          render={props => (
            <ChunkErrorBoundary>
              <Suspense fallback={<BackdropLoading />}>
                <MobileLogin {...props} />
              </Suspense>
            </ChunkErrorBoundary>
          )}
        />
        <RouterRoute>
          <AuthProvider>
            <TicketsContextProvider>
              <ChunkErrorBoundary>
                <Suspense fallback={<BackdropLoading />}>
                  <Switch>
                    <RouterRoute
                      path="/login/google/:stage"
                      component={Login}
                    />
                    <Route exact path="/login" component={Login} />
                    <Route exact path="/signup" component={Signup} />
                    <RouterRoute
                      exact
                      path="/sso/:token"
                      component={PlatformAccess}
                    />
                    <RouterRoute
                      exact
                      path="/fornecedores/entrar"
                      component={SupplierAccess}
                    />
                    <RouterRoute
                      exact
                      path="/ativar/:token"
                      component={PlatformActivation}
                    />
                    {/* <Route exact path="/create-company" component={Companies} /> */}
                    {/* Portal de parceiros: sessao propria, fora do AuthProvider do
                tenant. Route nativo porque o wrapper local redireciona quem ja
                esta logado e quebraria a tela de convite. */}
                    <RouterRoute path="/parceiros" component={PartnerRoutes} />
                    <WhatsAppsProvider>
                      <LoggedInLayout>
                        <ChunkErrorBoundary>
                          <Suspense fallback={<BackdropLoading />}>
                            {supplierPortal ? (
                              <Switch>
                                <Route
                                  exact
                                  path="/tickets/:ticketId?"
                                  component={TicketResponsiveContainer}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/connections"
                                  component={Connections}
                                  isPrivate
                                  adminOnly
                                />
                                <Redirect to="/tickets" />
                              </Switch>
                            ) : (
                              <>
                                <Route
                                  exact
                                  path="/"
                                  component={Dashboard}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/sga"
                                  component={Sga}
                                  isPrivate
                                  adminOnly
                                />
                                <Route
                                  exact
                                  path="/sga/cobrancas"
                                  component={SgaBilling}
                                  isPrivate
                                  adminOnly
                                />
                                <Route
                                  exact
                                  path="/cobranca"
                                  component={CentralCobranca}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/prospeccao"
                                  component={Prospeccao}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/tickets/:ticketId?"
                                  component={TicketResponsiveContainer}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/connections"
                                  component={Connections}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/quick-messages"
                                  component={QuickMessages}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/schedules"
                                  component={Schedules}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/todolist"
                                  component={ToDoList}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/tags"
                                  component={Tags}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/contacts"
                                  component={Contacts}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/helps"
                                  component={Helps}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/helps/:groupId"
                                  component={Helps}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/helps/:groupId/:contentId"
                                  component={Helps}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/users"
                                  component={Users}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/chatgpt"
                                  component={ChatGPT}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/settings"
                                  component={SettingsCustom}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/financeiro"
                                  component={Financeiro}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/queues"
                                  component={Queues}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/fluxos/:queueId?"
                                  component={Fluxos}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/announcements"
                                  component={Annoucements}
                                  isPrivate
                                />
                                <Route
                                  exact
                                  path="/subscription"
                                  component={Subscription}
                                  isPrivate
                                />

                                <Route
                                  exact
                                  path="/chats/:id?"
                                  component={Chat}
                                  isPrivate
                                />
                                {showCampaigns && (
                                  <>
                                    <Route
                                      exact
                                      path="/contact-lists"
                                      component={ContactLists}
                                      isPrivate
                                    />
                                    <Route
                                      exact
                                      path="/contact-lists/:contactListId/contacts"
                                      component={ContactListItems}
                                      isPrivate
                                    />
                                    <Route
                                      exact
                                      path="/campaigns"
                                      component={Campaigns}
                                      isPrivate
                                    />
                                    <Route
                                      exact
                                      path="/campaign/:campaignId/report"
                                      component={CampaignReport}
                                      isPrivate
                                    />
                                    <Route
                                      exact
                                      path="/campaigns-config"
                                      component={CampaignsConfig}
                                      isPrivate
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </Suspense>
                        </ChunkErrorBoundary>
                      </LoggedInLayout>
                    </WhatsAppsProvider>
                  </Switch>
                </Suspense>
              </ChunkErrorBoundary>
              <ToastContainer autoClose={3000} />
            </TicketsContextProvider>
          </AuthProvider>
        </RouterRoute>
      </Switch>
    </BrowserRouter>
  );
};

export default Routes;
