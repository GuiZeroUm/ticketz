import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import AppError from "../errors/AppError";
import {
  assertSgaTenant,
  sgaEnabled,
  snapshot,
  syncSga,
  listSga,
  loadSga,
  setSgaLink
} from "../services/SgaServices/service";
import { sgaRequest } from "../services/SgaServices/client";
import { text, isOverdue } from "../services/SgaServices/normalize";

const routes = Router();
routes.get("/sga/status", isAuth, async (req, res) => {
  const enabled = await sgaEnabled(req.user.companyId);
  const stored = enabled ? await snapshot(req.user.companyId) : null;
  return res.json({
    enabled,
    configured: enabled && !!process.env.ACNORTE_SGA_TOKEN,
    syncedAt: stored?.syncedAt || null,
    status: stored?.status || "idle",
    error: stored?.error || null,
    attemptedAt: stored?.attemptedAt || null
  });
});
routes.use("/sga", isAuth, async (req, _res, next) => {
  await assertSgaTenant(req.user.companyId);
  next();
});
routes.get("/sga/vehicles", async (req, res) =>
  res.json(await listSga(req.user.companyId, req.query))
);
routes.post("/sga/sync", isAdmin, async (req, res) => {
  if (!process.env.ACNORTE_SGA_TOKEN)
    throw new AppError("ERR_SGA_NOT_CONFIGURED", 503);
  const stored = await snapshot(req.user.companyId);
  if (
    stored?.attemptedAt &&
    Date.now() - new Date(stored.attemptedAt).getTime() < 60000
  )
    return res.status(202).json({ accepted: true });
  void syncSga(req.user.companyId).catch(() => undefined);
  return res.status(202).json({ accepted: true });
});
routes.put("/sga/members/:memberId/contact", isAdmin, async (req, res) => {
  await setSgaLink(
    req.user.companyId,
    req.params.memberId,
    req.body.contactId,
    Number(req.user.id)
  );
  return res.json({ success: true });
});
routes.get("/sga/vehicles/:vehicleId", async (req, res) => {
  const { stored, vehicles, contacts, today } = await loadSga(
    req.user.companyId
  );
  const vehicle = vehicles.find(v => v.id === req.params.vehicleId);
  if (!vehicle) throw new AppError("ERR_SGA_VEHICLE_NOT_FOUND", 404);
  return res.json({
    vehicle,
    syncedAt: stored.syncedAt,
    relatedVehicles: vehicles
      .filter(v => v.memberId === vehicle.memberId)
      .map(({ member: _member, ...v }) => v),
    candidates: contacts
      .filter(c => vehicle.member?.match.candidates.includes(c.id))
      .map(({ extraInfo: _extra, ...c }) => c),
    bills: stored.data.bills
      .filter(b => b.memberId === vehicle.memberId)
      .map(b => ({
        ...b,
        overdue: isOverdue(b, today),
        vehicleSpecific: b.vehicleIds.includes(vehicle.id)
      }))
  });
});
routes.get("/sga/bills/:number", async (req, res) => {
  const stored = await snapshot(req.user.companyId);
  const bill = stored?.data.bills?.find(b => b.number === req.params.number);
  if (!bill) throw new AppError("ERR_SGA_BILL_NOT_FOUND", 404);
  const data = await sgaRequest(
    `buscar/boleto/${encodeURIComponent(bill.number)}`
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || text(row.codigo_associado) !== bill.memberId)
    throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
  const url = text(row.link_boleto);
  const validUrl = /^https:\/\/[^\s]+$/i.test(url) ? url : null;
  return res.json({
    number: bill.number,
    line: text(row.linha_digitavel),
    url: validUrl,
    status: text(row.descricao_situacao_boleto),
    due: text(row.data_vencimento),
    amount: row.valor_boleto
  });
});
export default routes;
