import React, { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { toast } from "react-toastify";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import ButtonWithSpinner from "../../../components/ButtonWithSpinner";
import MainContainer from "../../../components/MainContainer";
import MainHeader from "../../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../../components/MainHeaderButtonsWrapper";
import TableRowSkeleton from "../../../components/TableRowSkeleton";
import Title from "../../../components/Title";
import partnerApi from "../../../services/partnerApi";
import toastError from "../../../errors/toastError";
import { formatCurrency } from "../format";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  fullWidth: {
    width: "100%"
  },
  inactive: {
    color: "gray"
  },
  gracePeriod: {
    color: "orange"
  },
  almostDue: {
    color: theme.mode === "light" ? "blue" : "#38f"
  }
}));

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  planId: "",
  saleValue: "",
  recurrence: "MENSAL"
};

const PartnerClientes = () => {
  const classes = useStyles();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await partnerApi.get("/partner/companies");
      setRows(data);
    } catch (error) {
      toastError(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCompanies();

    partnerApi
      .get("/partner/plans")
      .then(({ data }) => setPlans(data))
      .catch(toastError);
  }, [loadCompanies]);

  const selectedPlan = plans.find(plan => plan.id === form.planId);
  const floor = selectedPlan?.minValue;

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const handleOpenEdit = row => {
    setEditingId(row.company.id);
    setForm({
      ...emptyForm,
      name: row.company.name || "",
      email: row.company.email || "",
      phone: row.company.phone || "",
      planId: row.company.planId || "",
      saleValue: row.company.saleValue ?? "",
      recurrence: row.company.recurrence || "MENSAL"
    });
    setModalOpen(true);
  };

  const handleChange = field => event => {
    setForm(prev => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async () => {
    if (floor && Number(form.saleValue) < Number(floor)) {
      toast.error(
        `O preço de venda não pode ser menor que ${formatCurrency(floor)}`
      );
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await partnerApi.put(`/partner/companies/${editingId}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          planId: form.planId,
          saleValue: Number(form.saleValue)
        });
      } else {
        await partnerApi.post("/partner/companies", {
          ...form,
          saleValue: Number(form.saleValue)
        });
      }
      toast.success("Operação realizada com sucesso!");
      setModalOpen(false);
      await loadCompanies();
    } catch (error) {
      toastError(error);
    }
    setSaving(false);
  };

  const rowClass = company => {
    if (moment(company.dueDate).isValid()) {
      const diff = moment(company.dueDate).diff(moment(), "days");
      if (diff < -5) {
        return classes.inactive;
      }
      if (diff < 0) {
        return classes.gracePeriod;
      }
      if (diff < 7) {
        return classes.almostDue;
      }
    }
    return null;
  };

  const renderPaymentStatus = row => {
    if (!row.openInvoice) {
      return "Em dia";
    }
    return moment(row.openInvoice.dueDate).isBefore(moment(), "day")
      ? "Em atraso"
      : "Aguardando pagamento";
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Meus clientes</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreate}
          >
            Novo cliente
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell align="left">Cliente</TableCell>
              <TableCell align="left">E-mail</TableCell>
              <TableCell align="left">Plano</TableCell>
              <TableCell align="right">Preço de venda</TableCell>
              <TableCell align="center">Vencimento</TableCell>
              <TableCell align="center">Pagamento</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRowSkeleton columns={7} />}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Você ainda não cadastrou nenhum cliente.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map(row => (
                <TableRow
                  key={row.company.id}
                  className={rowClass(row.company)}
                >
                  <TableCell align="left" style={{ color: "unset" }}>
                    {row.company.name}
                  </TableCell>
                  <TableCell align="left" style={{ color: "unset" }}>
                    {row.company.email || "-"}
                  </TableCell>
                  <TableCell align="left" style={{ color: "unset" }}>
                    {row.company.plan?.name || "-"}
                  </TableCell>
                  <TableCell align="right" style={{ color: "unset" }}>
                    {formatCurrency(row.company.saleValue)}
                  </TableCell>
                  <TableCell align="center" style={{ color: "unset" }}>
                    {row.company.dueDate
                      ? moment(row.company.dueDate).format("DD/MM/YYYY")
                      : "-"}
                  </TableCell>
                  <TableCell align="center" style={{ color: "unset" }}>
                    {renderPaymentStatus(row)}
                  </TableCell>
                  <TableCell align="center" style={{ color: "unset" }}>
                    <Button size="small" onClick={() => handleOpenEdit(row)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          {editingId ? "Editar cliente" : "Cadastrar cliente"}
        </DialogTitle>
        <DialogContent dividers>
          <Grid spacing={2} container>
            <Grid xs={12} sm={6} item>
              <TextField
                label="Nome da empresa"
                variant="outlined"
                margin="dense"
                className={classes.fullWidth}
                value={form.name}
                onChange={handleChange("name")}
                required
              />
            </Grid>
            <Grid xs={12} sm={6} item>
              <TextField
                label="E-mail"
                variant="outlined"
                margin="dense"
                className={classes.fullWidth}
                value={form.email}
                onChange={handleChange("email")}
                required
              />
            </Grid>
            <Grid xs={12} sm={6} item>
              <TextField
                label="Telefone"
                variant="outlined"
                margin="dense"
                className={classes.fullWidth}
                value={form.phone}
                onChange={handleChange("phone")}
              />
            </Grid>
            {!editingId && (
              <Grid xs={12} sm={6} item>
                <TextField
                  label="Senha do primeiro acesso"
                  type="password"
                  variant="outlined"
                  margin="dense"
                  className={classes.fullWidth}
                  value={form.password}
                  onChange={handleChange("password")}
                  required
                />
              </Grid>
            )}
            <Grid xs={12} sm={6} item>
              <FormControl variant="outlined" margin="dense" fullWidth>
                <InputLabel id="partner-plan-label">Plano</InputLabel>
                <Select
                  labelId="partner-plan-label"
                  label="Plano"
                  value={form.planId}
                  onChange={handleChange("planId")}
                >
                  {plans.map(plan => (
                    <MenuItem key={plan.id} value={plan.id}>
                      {plan.name} — mínimo {formatCurrency(plan.minValue)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} item>
              <TextField
                label="Preço de venda"
                type="number"
                variant="outlined"
                margin="dense"
                className={classes.fullWidth}
                value={form.saleValue}
                onChange={handleChange("saleValue")}
                inputProps={{ min: floor || 0, step: "0.01" }}
                helperText={
                  floor
                    ? `Mínimo do plano: ${formatCurrency(floor)}`
                    : "Selecione um plano para ver o mínimo"
                }
                required
              />
            </Grid>
            {!editingId && (
              <Grid xs={12} sm={6} item>
                <FormControl variant="outlined" margin="dense" fullWidth>
                  <InputLabel id="partner-recurrence-label">
                    Recorrência
                  </InputLabel>
                  <Select
                    labelId="partner-recurrence-label"
                    label="Recorrência"
                    value={form.recurrence}
                    onChange={handleChange("recurrence")}
                  >
                    <MenuItem value="MENSAL">Mensal</MenuItem>
                    <MenuItem value="BIMESTRAL">Bimestral</MenuItem>
                    <MenuItem value="TRIMESTRAL">Trimestral</MenuItem>
                    <MenuItem value="SEMESTRAL">Semestral</MenuItem>
                    <MenuItem value="ANUAL">Anual</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid xs={12} item>
              <Typography variant="caption" color="textSecondary">
                O cliente nasce com 3 dias de teste. Se a primeira fatura não
                for paga, a conta é bloqueada automaticamente.
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <ButtonWithSpinner
            loading={saving}
            onClick={handleSubmit}
            variant="contained"
            color="primary"
          >
            Salvar
          </ButtonWithSpinner>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default PartnerClientes;
