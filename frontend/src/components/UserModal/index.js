import React, { useState, useEffect, useContext, useRef } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import Select from "@material-ui/core/Select";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Typography from "@material-ui/core/Typography";
import Autocomplete from "@material-ui/lab/Autocomplete";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import FotoUsuario from "./FotoUsuario";
import QueueSelect from "../QueueSelect";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../Can";
import useFocoDialogo from "../../hooks/useFocoDialogo";
import { screenOptions, defaultUserScreens } from "../../helpers/screenAccess";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexWrap: "wrap"
  },
  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1)
    }
  },

  btnWrapper: {
    position: "relative"
  },

  buttonProgress: {
    color: theme.isStardew ? theme.stardew.green : green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120
  }
}));

const UserSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required"),
  password: Yup.string().min(5, "Too Short!").max(50, "Too Long!"),
  email: Yup.string().email("Invalid email").required("Required")
});

const UserModal = ({ open, onClose, userId }) => {
  const classes = useStyles();
  const restaurarFoco = useFocoDialogo(open);

  const initialState = {
    name: "",
    email: "",
    password: "",
    profile: "user"
  };

  const { user: loggedInUser } = useContext(AuthContext);

  const [foto, definirFoto] = useState(null);
  const [removerFoto, definirRemoverFoto] = useState(false);
  const usuarioSalvo = useRef(null);
  useEffect(() => {
    if (open) {
      definirFoto(null);
      definirRemoverFoto(false);
      usuarioSalvo.current = userId || null;
    }
  }, [open, userId]);
  const [user, setUser] = useState(initialState);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);
  const [selectedScreens, setSelectedScreens] = useState(defaultUserScreens);
  const [groupOptions, setGroupOptions] = useState([]);
  const [customGroupAccess, setCustomGroupAccess] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);

  useEffect(() => {
    if (!open || loggedInUser.profile !== "admin") return;
    let active = true;
    api
      .get("/users/group-options", {
        params: { companyId: user.companyId || loggedInUser.companyId }
      })
      .then(({ data }) => {
        if (active) setGroupOptions(data);
      })
      .catch(toastError);
    return () => {
      active = false;
    };
  }, [open, loggedInUser.profile, loggedInUser.companyId, user.companyId]);

  useEffect(() => {
    let ativo = true;
    const fetchUser = async () => {
      if (!open || !userId) return;
      try {
        const { data } = await api.get(`/users/${userId}`);
        if (!ativo) return;
        setUser(prevState => {
          return { ...prevState, ...data };
        });
        const userQueueIds = data.queues?.map(queue => queue.id);
        setSelectedQueueIds(userQueueIds);
        setCustomGroupAccess(Array.isArray(data.groupAccessIds));
        setSelectedGroupIds(data.groupAccessIds || []);
        setSelectedScreens(
          Array.isArray(data.visibleScreens)
            ? data.visibleScreens
            : data.profile === "admin"
              ? screenOptions.map(screen => screen.id)
              : defaultUserScreens
        );
      } catch (err) {
        toastError(err);
      }
    };

    fetchUser();
    return () => {
      ativo = false;
    };
  }, [userId, open]);

  const handleClose = () => {
    onClose();
    setUser(initialState);
    setSelectedQueueIds([]);
    setSelectedScreens(defaultUserScreens);
    setCustomGroupAccess(false);
    setSelectedGroupIds([]);
    setGroupOptions([]);
  };

  const handleSaveUser = async values => {
    const userData = {
      ...values,
      queueIds: selectedQueueIds,
      visibleScreens: selectedScreens,
      groupAccessIds: customGroupAccess ? selectedGroupIds : null
    };
    try {
      if (usuarioSalvo.current) {
        await api.put(`/users/${usuarioSalvo.current}`, userData);
      } else {
        const { data } = await api.post("/users", userData);
        usuarioSalvo.current = data.id;
      }
      if (foto) {
        const formulario = new FormData();
        formulario.append("photo", foto);
        await api.post(`/users/${usuarioSalvo.current}/photo`, formulario);
      } else if (removerFoto) {
        await api.delete(`/users/${usuarioSalvo.current}/photo`);
      }
      handleClose();
      toast.success(i18n.t("userModal.success"));
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={open}
        aria-labelledby="form-dialog-title"
        disableRestoreFocus
        TransitionProps={{ onExited: restaurarFoco }}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle id="form-dialog-title">
          {userId
            ? `${i18n.t("userModal.title.edit")}`
            : `${i18n.t("userModal.title.add")}`}
        </DialogTitle>
        <Formik
          initialValues={user}
          enableReinitialize={true}
          validationSchema={UserSchema}
          onSubmit={async (values, actions) => {
            await handleSaveUser(values);
            actions.setSubmitting(false);
          }}
        >
          {({ values, touched, errors, isSubmitting, setFieldValue }) => (
            <Form>
              <DialogContent dividers>
                <FotoUsuario
                  usuario={user}
                  arquivo={foto}
                  remover={removerFoto}
                  desabilitado={isSubmitting}
                  aoAlterar={(arquivo, remover) => {
                    definirFoto(arquivo);
                    definirRemoverFoto(remover);
                  }}
                />
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    id="usuario-nome"
                    label={i18n.t("userModal.form.name")}
                    autoFocus
                    name="name"
                    error={touched.name && Boolean(errors.name)}
                    helperText={touched.name && errors.name}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                  <Field
                    as={TextField}
                    id="usuario-senha"
                    label={i18n.t("userModal.form.password")}
                    type="password"
                    name="password"
                    error={touched.password && Boolean(errors.password)}
                    helperText={touched.password && errors.password}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                    inputProps={{
                      autoComplete: "off"
                    }}
                  />
                </div>
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    id="usuario-email"
                    label={i18n.t("userModal.form.email")}
                    name="email"
                    error={touched.email && Boolean(errors.email)}
                    helperText={touched.email && errors.email}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                  <FormControl
                    variant="outlined"
                    className={classes.formControl}
                    margin="dense"
                    fullWidth
                  >
                    <Can
                      role={loggedInUser.profile}
                      perform="user-modal:editProfile"
                      yes={() => (
                        <>
                          <InputLabel id="profile-selection-input-label">
                            {i18n.t("userModal.form.profile")}
                          </InputLabel>

                          <Field
                            as={Select}
                            label={i18n.t("userModal.form.profile")}
                            name="profile"
                            labelId="profile-selection-input-label"
                            id="profile-selection"
                            required
                            onChange={event => {
                              const profile = event.target.value;
                              setFieldValue("profile", profile);
                              if (profile === "admin") {
                                setCustomGroupAccess(false);
                                setSelectedGroupIds([]);
                              }
                              setSelectedScreens(
                                profile === "admin"
                                  ? screenOptions.map(screen => screen.id)
                                  : defaultUserScreens
                              );
                            }}
                          >
                            <MenuItem value="admin">
                              {i18n.t("userModal.listItems.adminProfile")}
                            </MenuItem>
                            <MenuItem value="user">
                              {i18n.t("userModal.listItems.userProfile")}
                            </MenuItem>
                          </Field>
                        </>
                      )}
                    />
                  </FormControl>
                </div>
                <Can
                  role={loggedInUser.profile}
                  perform="user-modal:editQueues"
                  yes={() => (
                    <QueueSelect
                      selectedQueueIds={selectedQueueIds}
                      onChange={values => setSelectedQueueIds(values)}
                    />
                  )}
                />
                <Typography variant="subtitle1">
                  {i18n.t("userModal.form.visibleScreens", {
                    defaultValue: "Telas visíveis"
                  })}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {i18n.t("userModal.form.screenAccessHint")}
                </Typography>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}
                >
                  {screenOptions.map(screen => (
                    <FormControlLabel
                      key={screen.id}
                      control={
                        <Checkbox
                          checked={selectedScreens.includes(screen.id)}
                          onChange={event =>
                            setSelectedScreens(previous =>
                              event.target.checked
                                ? [...previous, screen.id]
                                : previous.filter(id => id !== screen.id)
                            )
                          }
                          disabled={loggedInUser.profile !== "admin"}
                        />
                      }
                      label={i18n.t(screen.label, { defaultValue: screen.id })}
                    />
                  ))}
                </div>
                <Typography variant="subtitle1" style={{ marginTop: 20 }}>
                  {i18n.t("userModal.form.groupAccess", {
                    defaultValue: "Acesso aos grupos de conversa"
                  })}
                </Typography>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  display="block"
                >
                  {i18n.t("userModal.form.groupAccessHint", {
                    defaultValue:
                      "Escolha grupos específicos para este usuário. Sem personalização, vale o acesso pelas filas. Administradores visualizam todos os grupos."
                  })}
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={customGroupAccess}
                      onChange={event =>
                        setCustomGroupAccess(event.target.checked)
                      }
                      disabled={
                        loggedInUser.profile !== "admin" ||
                        values.profile === "admin"
                      }
                    />
                  }
                  label={i18n.t("userModal.form.customGroupAccess", {
                    defaultValue: "Selecionar grupos para este usuário"
                  })}
                />
                {customGroupAccess && (
                  <Autocomplete
                    multiple
                    options={groupOptions}
                    getOptionLabel={option => option.name || String(option.id)}
                    getOptionSelected={(option, value) =>
                      option.id === value.id
                    }
                    value={groupOptions.filter(group =>
                      selectedGroupIds.includes(group.id)
                    )}
                    onChange={(_, groups) =>
                      setSelectedGroupIds(groups.map(group => group.id))
                    }
                    disabled={
                      loggedInUser.profile !== "admin" ||
                      values.profile === "admin"
                    }
                    renderInput={params => (
                      <TextField
                        {...params}
                        variant="outlined"
                        margin="dense"
                        label={i18n.t("userModal.form.allowedGroups", {
                          defaultValue: "Grupos permitidos"
                        })}
                        placeholder={i18n.t("userModal.form.searchGroups", {
                          defaultValue: "Buscar grupo"
                        })}
                      />
                    )}
                  />
                )}
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {i18n.t("userModal.buttons.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  disabled={isSubmitting}
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {userId
                    ? `${i18n.t("userModal.buttons.okEdit")}`
                    : `${i18n.t("userModal.buttons.okAdd")}`}
                  {isSubmitting && (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default UserModal;
