import { QueryTypes } from "sequelize";
import sequelize from "../../database";

const GetGroupUnreadCountService = async (
  userId: number,
  companyId: number,
  profile: string
): Promise<number> => {
  const accessCondition =
    profile === "admin"
      ? ""
      : `
        AND (CASE
          WHEN (SELECT "groupAccessIds" FROM "Users" WHERE id=:userId AND "companyId"=:companyId) IS NOT NULL
          THEN EXISTS (
            SELECT 1 FROM "Users" access_user
            WHERE access_user.id=:userId AND access_user."companyId"=:companyId
              AND access_user."groupAccessIds" @> jsonb_build_array(ticket."contactId")
          )
          ELSE (
          NOT EXISTS (
            SELECT 1 FROM "GroupQueues" group_queue
            WHERE group_queue."groupContactId" = ticket."contactId"
              AND group_queue."companyId" = :companyId
          )
          OR EXISTS (
            SELECT 1
            FROM "GroupQueues" group_queue
            INNER JOIN "UserQueues" user_queue
              ON user_queue."queueId" = group_queue."queueId"
            WHERE group_queue."groupContactId" = ticket."contactId"
              AND group_queue."companyId" = :companyId
              AND user_queue."userId" = :userId
          )
          ) END)
      `;

  const [result] = await sequelize.query<{ count: number }>(
    `
      SELECT COALESCE(SUM(read_state."unreadCount"), 0)::integer AS count
      FROM "GroupReadStates" read_state
      INNER JOIN "Tickets" ticket ON ticket.id = read_state."ticketId"
      INNER JOIN "Contacts" contact ON contact.id = ticket."contactId"
      WHERE read_state."userId" = :userId
        AND read_state."companyId" = :companyId
        AND ticket."companyId" = :companyId
        AND contact."companyId" = :companyId
        AND ticket."isGroup" = true
        AND contact."isGroup" = true
        AND contact."groupMode" = 'conversation'
        ${accessCondition}
    `,
    {
      replacements: { userId, companyId },
      type: QueryTypes.SELECT
    }
  );

  return Number(result?.count || 0);
};

export default GetGroupUnreadCountService;
