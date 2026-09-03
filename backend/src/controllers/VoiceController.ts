import { Request, Response } from "express";
import {
  acceptVoiceCall,
  disconnectVoiceConnection,
  endVoiceCall,
  exchangeVoiceWebRTC,
  listVoiceConnections,
  pairVoiceConnection,
  rejectVoiceCall
} from "../services/VoiceServices/VoiceService";

export const index = async (req: Request, res: Response): Promise<Response> =>
  res.json(await listVoiceConnections(req.user.companyId));

export const pair = async (req: Request, res: Response): Promise<Response> =>
  res
    .status(201)
    .json(
      await pairVoiceConnection(
        req.user.companyId,
        Number(req.params.whatsappId),
        req.body.riskAccepted
      )
    );

export const remove = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await disconnectVoiceConnection(
      req.user.companyId,
      Number(req.params.whatsappId)
    )
  );

export const accept = async (req: Request, res: Response): Promise<Response> =>
  res.json(await acceptVoiceCall(Number(req.params.callId), req.user));

export const reject = async (req: Request, res: Response): Promise<Response> =>
  res.json(await rejectVoiceCall(Number(req.params.callId), req.user));

export const end = async (req: Request, res: Response): Promise<Response> =>
  res.json(await endVoiceCall(Number(req.params.callId), req.user));

export const webrtc = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await exchangeVoiceWebRTC(
      Number(req.params.callId),
      req.user,
      req.headers["x-voice-token"],
      req.body.sdp_offer
    )
  );
