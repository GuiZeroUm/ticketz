import Ticket from "../../../models/Ticket";
import sequelize from "../../../database";
import { buildTicketSearchFilter } from "../ticketSearchFilter";

// Renderiza o filtro com o gerador de SQL real do dialeto Postgres, sem
// abrir conexão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queryGenerator = (sequelize.getQueryInterface() as any).queryGenerator;

const sql = (term: string, companyId = 9): string =>
  queryGenerator.whereItemsQuery(buildTicketSearchFilter(term, companyId), {
    model: Ticket
  });

describe("buildTicketSearchFilter", () => {
  it("scopes the message subquery to the company", () => {
    expect(sql("boleto")).toContain('"companyId" = 9');
    expect(sql("boleto")).toContain("%boleto%");
  });

  it("lowercases the term", () => {
    expect(sql("BOLETO")).toContain("%boleto%");
    expect(sql("BOLETO")).not.toContain("BOLETO");
  });

  it("searches contact name, contact number and message body", () => {
    const rendered = sql("maria");
    expect(rendered).toContain('LOWER("contact"."name") LIKE');
    expect(rendered).toContain('"contact"."number" LIKE');
    expect(rendered).toContain('"id" IN (SELECT "ticketId" FROM "Messages"');
    expect(rendered).toContain('LOWER("body") LIKE');
  });

  it("escapes like wildcards", () => {
    expect(sql("50%_off")).toContain("%50\\%\\_off%");
  });

  it("escapes backslashes", () => {
    expect(sql("a\\b")).toContain("%a\\\\b%");
  });

  it("escapes quotes in the message subquery", () => {
    expect(sql("o'brien")).not.toMatch(/o'brien/);
    expect(sql("o'brien")).toContain("o''brien");
  });
});
