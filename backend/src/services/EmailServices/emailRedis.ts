import Redis from "ioredis";
import { REDIS_URI_CONNECTION } from "../../config/redis";

// One lazily created connection shared by the email lock and failure counters.
let connection: Redis | undefined;
const emailRedis = (): Redis =>
  connection || (connection = new Redis(REDIS_URI_CONNECTION));

export default emailRedis;
