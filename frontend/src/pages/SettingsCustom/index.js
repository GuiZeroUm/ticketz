import React, { useState, useEffect } from "react";
import CentralConfiguracoes from "../../components/Settings/CentralConfiguracoes";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import CabecalhoPagina from "../../components/CabecalhoPagina";
import { makeStyles, Paper, Button, Grid } from "@material-ui/core";

import TabPanel from "../../components/TabPanel";

import SchedulesForm from "../../components/SchedulesForm";
import CompaniesManager from "../../components/CompaniesManager";
import PlansManager from "../../components/PlansManager";
import HelpsManager from "../../components/HelpsManager";
import PartnersManager from "../../components/PartnersManager";
import Options from "../../components/Settings/Options";
import Whitelabel from "../../components/Settings/Whitelabel";
import PaymentGateway from "../../components/Settings/PaymentGateway";
import I18nSettings from "../../components/Settings/I18nSettings";
import VoiceSettings from "../../components/VoiceSettings";
import api from "../../services/api";

import { i18n } from "../../translate/i18n.js";
import { toast } from "react-toastify";

import useCompanies from "../../hooks/useCompanies";
import useAuth from "../../hooks/useAuth.js";
import useSettings from "../../hooks/useSettings";

import OnlyForSuperUser from "../../components/OnlyForSuperUser";
import OpenHoursEditor from "../../components/OpenHoursEditor";

// Helper to check if value is OpenHours format or empty
const isOpenHoursFormat = schedules => {
  if (!schedules || Object.keys(schedules).length === 0) return true;
  return (
    typeof schedules === "object" &&
    Array.isArray(schedules.weeklyRules) &&
    Array.isArray(schedules.overrides)
  );
};

const useStyles = makeStyles(theme => ({
  root: {
    flex: 1,
    backgroundColor: theme.palette.background.paper
  },
  mainPaper: {
    ...theme.scrollbarStyles,
    overflowY: "scroll",
    flex: 1
  },
  tab: {
    padding: "8px 12px",
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  paper: {
    ...theme.scrollbarStyles,
    overflowY: "scroll",
    padding: theme.spacing(2),
    display: "flex",
    alignItems: "center",
    width: "100%"
  },
  container: {
    width: "100%",
    maxHeight: "100%"
  },
  control: {
    padding: theme.spacing(1)
  },
  textfield: {
    width: "100%"
  }
}));

const SettingsCustom = () => {
  const classes = useStyles();
  const [schedules, setSchedules] = useState({});
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState({});
  const [settings, setSettings] = useState({});
  const [schedulesEnabled, setSchedulesEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const { getCurrentUserInfo } = useAuth();
  const { find, updateSchedules } = useCompanies();
  const { getAll: getAllSettings } = useSettings();

  useEffect(() => {
    async function findData() {
      setLoading(true);
      try {
        const companyId = localStorage.getItem("companyId");
        const company = await find(companyId);
        const settingList = await getAllSettings();
        setCompany(company);
        setSchedules(company.schedules);
        setSettings(settingList);

        if (Array.isArray(settingList)) {
          const scheduleType = settingList.find(d => d.key === "scheduleType");
          if (scheduleType) {
            setSchedulesEnabled(scheduleType.value === "company");
          }
        }

        const user = await getCurrentUserInfo();
        setCurrentUser(user);
      } catch (e) {
        toast.error(e);
      }
      setLoading(false);
    }
    findData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .get("/voice/connections")
      .then(() => setVoiceAvailable(true))
      .catch(() => setVoiceAvailable(false));
  }, []);

  const atualizarConfiguracoes = async () => {
    try {
      const lista = await getAllSettings();
      if (Array.isArray(lista)) {
        setSettings(lista);
        setSchedulesEnabled(
          lista.some(
            item => item.key === "scheduleType" && item.value === "company"
          )
        );
      }
    } catch (erro) {
      toast.error(erro);
    }
  };

  const handleSubmitSchedules = async data => {
    setLoading(true);
    try {
      setSchedules(data);
      await updateSchedules({ id: company.id, schedules: data });
      toast.success("Horários atualizados com sucesso.");
    } catch (e) {
      toast.error(e);
    }
    setLoading(false);
  };

  const isSuper = () => {
    return currentUser.super;
  };

  const isAdmin = () => {
    return currentUser.profile === "admin";
  };

  const renderizarSecao = tab => (
    <Paper
      className={classes.paper}
      elevation={0}
      style={{ padding: 0, overflow: "visible", border: 0 }}
    >
      <TabPanel className={classes.container} value={tab} name={"schedules"}>
        {isOpenHoursFormat(schedules) ? (
          <>
            <OpenHoursEditor value={schedules} onChange={setSchedules} />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16
              }}
            >
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleSubmitSchedules(schedules)}
                disabled={loading}
              >
                {loading ? i18n.t("settings.saving") : i18n.t("common.save")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Grid spacing={4} container>
              <Grid item xs={12}>
                <div>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setSchedules({})}
                    disabled={loading}
                  >
                    ⚠️ {i18n.t("settings.schedules.updateToNewFormat")}
                  </Button>
                </div>
              </Grid>
            </Grid>
            <SchedulesForm
              loading={loading}
              onSubmit={handleSubmitSchedules}
              initialValues={schedules}
            />
          </>
        )}
      </TabPanel>
      <TabPanel className={classes.container} value={tab} name={"whitelabel"}>
        <Whitelabel settings={settings} />
      </TabPanel>
      <TabPanel className={classes.container} value={tab} name={"voiceCalls"}>
        <VoiceSettings />
      </TabPanel>
      <TabPanel className={classes.container} value={tab} name={"helps"}>
        <HelpsManager />
      </TabPanel>
      <OnlyForSuperUser
        user={currentUser}
        yes={() => (
          <>
            <TabPanel
              className={classes.container}
              value={tab}
              name={"paymentGateway"}
            >
              <PaymentGateway settings={settings} />
            </TabPanel>
            <TabPanel className={classes.container} value={tab} name={"i18n"}>
              <I18nSettings />
            </TabPanel>
            <TabPanel
              className={classes.container}
              value={tab}
              name={"companies"}
            >
              <CompaniesManager />
            </TabPanel>
            <TabPanel className={classes.container} value={tab} name={"plans"}>
              <PlansManager />
            </TabPanel>
            <TabPanel
              className={classes.container}
              value={tab}
              name={"partners"}
            >
              <PartnersManager />
            </TabPanel>
          </>
        )}
      />
      <TabPanel className={classes.container} value={tab} name={"options"}>
        <Options
          settings={settings}
          scheduleTypeChanged={value =>
            setSchedulesEnabled(value === "company")
          }
        />
      </TabPanel>
    </Paper>
  );

  return (
    <MainContainer>
      <MainHeader>
        <CabecalhoPagina
          titulo={i18n.t("settings.title")}
          descricao={i18n.t("redesign.descricaoConfiguracoes")}
        />
      </MainHeader>
      <div style={{ overflow: "auto", flex: 1 }}>
        <CentralConfiguracoes
          conteudo={renderizarSecao}
          aoAlternar={atualizarConfiguracoes}
          superusuario={isSuper()}
          administrador={isAdmin()}
          horarios={schedulesEnabled}
          voz={voiceAvailable}
        />
      </div>
    </MainContainer>
  );
};
export default SettingsCustom;
