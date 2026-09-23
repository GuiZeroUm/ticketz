import {
  Op,
  fn,
  where,
  col,
  Filterable,
  Includeable,
  WhereOptions
} from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import { intersection } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import { getTicketAccessMode } from "./TicketAccessPolicy";
import { ticketQueueScope } from "./TicketQueueAccess";
import { serializeClaimOnlyTicket } from "./ClaimOnlyTicket";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  updatedAt?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  queueIds: number[];
  tags: number[];
  users: number[];
  companyId: number;
}

interface Response {
  tickets: Array<Ticket | ReturnType<typeof serializeClaimOnlyTicket>>;
  count: number;
  hasMore: boolean;
}

const ListTicketsServiceKanban = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  tags,
  users,
  status,
  date,
  updatedAt,
  showAll,
  userId,
  withUnreadMessages,
  companyId
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId);
  const accessMode = await getTicketAccessMode(companyId);
  const ownerOnly = user.profile !== "admin" && accessMode === "owner";
  const accessConditions: WhereOptions<Ticket>[] = ownerOnly
    ? [
        {
          [Op.or]: [
            { userId },
            {
              [Op.and]: [
                { status: "pending" },
                { userId: null },
                ticketQueueScope(user.profile, queueIds)
              ]
            }
          ]
        }
      ]
    : [
        {
          [Op.or]: [{ userId }, { status: "pending" }],
          queueId: { [Op.or]: [queueIds, null] }
        }
      ];
  let whereCondition: Filterable["where"] = { [Op.and]: accessConditions };
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "presence"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["name"]
    }
  ];

  if (showAll === "true" && user.profile === "admin") {
    whereCondition = { queueId: { [Op.or]: [queueIds, null] } };
  }

  whereCondition = {
    ...whereCondition,
    status: status || { [Op.or]: ["pending", "open"] }
  };

  if (searchParam) {
    if (ownerOnly) {
      accessConditions.push({ userId });
    }
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();

    includeCondition = [
      ...includeCondition,
      {
        model: Message,
        as: "messages",
        attributes: ["id", "body"],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    };
  }

  if (date) {
    whereCondition = {
      ...whereCondition,
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      ...whereCondition,
      updatedAt: {
        [Op.between]: [
          +startOfDay(parseISO(updatedAt)),
          +endOfDay(parseISO(updatedAt))
        ]
      }
    };
  }

  if (withUnreadMessages === "true") {
    whereCondition = {
      ...whereCondition,
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketsTagFilter: number[][] = await Promise.all(
      tags.map(async tag => {
        const ticketTags = await TicketTag.findAll({ where: { tagId: tag } });
        return ticketTags.map(t => t.ticketId);
      })
    );

    const ticketsIntersection: number[] = intersection(...ticketsTagFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  if (Array.isArray(users) && users.length > 0) {
    const ticketsUserFilter: number[][] = await Promise.all(
      users.map(async filteredUserId => {
        const ticketUsers = await Ticket.findAll({
          where: { userId: filteredUserId }
        });
        return ticketUsers.map(t => t.id);
      })
    );

    const ticketsIntersection: number[] = intersection(...ticketsUserFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  whereCondition = {
    ...whereCondition,
    companyId
  };

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", "DESC"]],
    subQuery: false
  });
  const hasMore = count > offset + tickets.length;

  return {
    tickets: ownerOnly
      ? tickets.map(ticket =>
          ticket.status === "pending" && !ticket.userId
            ? serializeClaimOnlyTicket(ticket)
            : ticket
        )
      : tickets,
    count,
    hasMore
  };
};

export default ListTicketsServiceKanban;
