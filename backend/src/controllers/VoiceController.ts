import { Request, Response } from "express";
import AppError from "../errors/AppError";
import {
  acceptVoiceCall,
  disconnectVoiceConnection,
  endVoiceCall,
  exchangeVoiceWebRTC,
  listVoiceConnections,
  pairVoiceConnection,
  rejectVoiceCall
} from "../services/VoiceServices/VoiceService";

export const requireVoiceResourceId = (value: string): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError("ERR_VOICE_INVALID_RESOURCE_ID", 422);
  }
  return id;
};

export const index = async (req: Request, res: Response): Promise<Response> =>
  res.json(await listVoiceConnections(req.user.companyId));

export const pair = async (req: Request, res: Response): Promise<Response> =>
  res
    .status(201)
    .json(
      await pairVoiceConnection(
        req.user.companyId,
        requireVoiceResourceId(req.params.whatsappId),
        req.body.riskAccepted
      )
    );

export const remove = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await disconnectVoiceConnection(
      req.user.companyId,
      requireVoiceResourceId(req.params.whatsappId)
    )
  );

export const accept = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await acceptVoiceCall(requireVoiceResourceId(req.params.callId), req.user)
  );

export const reject = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await rejectVoiceCall(requireVoiceResourceId(req.params.callId), req.user)
  );

export const end = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await endVoiceCall(requireVoiceResourceId(req.params.callId), req.user)
  );

export const webrtc = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await exchangeVoiceWebRTC(
      requireVoiceResourceId(req.params.callId),
      req.user,
      req.headers["x-voice-token"],
      req.body.sdp_offer
    )
  );
