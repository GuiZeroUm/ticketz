import { Request, Response } from "express";
import { store, update } from "../HelpController";
import extractHelpImages from "../../helpers/extractHelpImages";
import CreateService from "../../services/HelpServices/CreateService";
import UpdateService from "../../services/HelpServices/UpdateService";
import ShowService from "../../services/HelpServices/ShowService";
import HelpGroupShowService from "../../services/HelpGroupServices/ShowService";
import { getIO } from "../../libs/socket";

jest.mock("../../helpers/extractHelpImages", () => ({
  __esModule: true,
  default: jest.fn()
}));
// sanitize-html ships ESM that this jest setup does not transform; sanitizing
// is not under test here, so pass the content through.
jest.mock("../../helpers/sanitizeHelpContent", () => ({
  __esModule: true,
  default: (content: string) => content
}));
jest.mock("../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../models/HelpGroup", () => ({ __esModule: true, default: {} }));
jest.mock("../../services/HelpServices/ListService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/CreateService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/ShowService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/UpdateService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/DeleteService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/FindService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpServices/ReorderService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpGroupServices/ShowPublicService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/HelpGroupServices/ShowService", () => ({
  __esModule: true,
  default: jest.fn()
}));

describe("help articles: image extraction runs only after authorization", () => {
  const emit = jest.fn();
  const article = {
    groupId: 5,
    title: "t",
    type: "article",
    content: '<p>texto<img src="data:image/png;base64,ZmFrZS1wbmc="></p>'
  };
  const request = (body: unknown) =>
    ({
      body,
      params: { id: "42" },
      user: { id: "1", companyId: 7, profile: "admin", isSuper: false }
    }) as unknown as Request;
  const response = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response;
  };
  const ownGroup = {
    id: 5,
    companyId: 7,
    audience: "company",
    isGlobal: false
  };
  const foreignGroup = { ...ownGroup, id: 6, companyId: 8 };

  beforeEach(() => {
    jest.resetAllMocks();
    (getIO as jest.Mock).mockReturnValue({
      emit,
      to: jest.fn().mockReturnValue({ emit })
    });
    (extractHelpImages as jest.Mock).mockResolvedValue("<p>extracted</p>");
  });

  it("store: a forbidden group writes no file and creates nothing", async () => {
    (HelpGroupShowService as jest.Mock).mockResolvedValue(foreignGroup);

    await expect(
      store(request({ ...article, groupId: 6 }), response())
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(extractHelpImages).not.toHaveBeenCalled();
    expect(CreateService).not.toHaveBeenCalled();
  });

  it("store: an authorized article is extracted and saved with the result", async () => {
    (HelpGroupShowService as jest.Mock).mockResolvedValue(ownGroup);
    (CreateService as jest.Mock).mockResolvedValue({ id: 1 });

    await store(request(article), response());

    expect(extractHelpImages).toHaveBeenCalledWith(
      expect.stringContaining("data:image/png;base64,ZmFrZS1wbmc=")
    );
    expect(CreateService).toHaveBeenCalledWith(
      expect.objectContaining({ content: "<p>extracted</p>" })
    );
  });

  it("store: a video never goes through extraction", async () => {
    (HelpGroupShowService as jest.Mock).mockResolvedValue(ownGroup);
    (CreateService as jest.Mock).mockResolvedValue({ id: 1 });

    await store(
      request({ groupId: 5, title: "t", type: "video", video: "dQw4w9WgXcQ" }),
      response()
    );

    expect(extractHelpImages).not.toHaveBeenCalled();
  });

  it("update: a forbidden destination group writes no file", async () => {
    (ShowService as jest.Mock).mockResolvedValue({ id: 42, groupId: 5 });
    (HelpGroupShowService as jest.Mock).mockImplementation(
      async (id: number) => (id === 5 ? ownGroup : foreignGroup)
    );

    await expect(
      update(request({ ...article, groupId: 6 }), response())
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(extractHelpImages).not.toHaveBeenCalled();
    expect(UpdateService).not.toHaveBeenCalled();
  });

  it("update: a forbidden origin group writes no file", async () => {
    (ShowService as jest.Mock).mockResolvedValue({ id: 42, groupId: 6 });
    (HelpGroupShowService as jest.Mock).mockImplementation(
      async (id: number) => (id === 5 ? ownGroup : foreignGroup)
    );

    await expect(update(request(article), response())).rejects.toMatchObject({
      statusCode: 403
    });

    expect(extractHelpImages).not.toHaveBeenCalled();
    expect(UpdateService).not.toHaveBeenCalled();
  });

  it("update: an authorized article is extracted before UpdateService", async () => {
    (ShowService as jest.Mock).mockResolvedValue({ id: 42, groupId: 5 });
    (HelpGroupShowService as jest.Mock).mockResolvedValue(ownGroup);
    (UpdateService as jest.Mock).mockResolvedValue({ id: 42 });

    await update(request(article), response());

    expect(extractHelpImages).toHaveBeenCalledTimes(1);
    expect(UpdateService).toHaveBeenCalledWith(
      expect.objectContaining({ content: "<p>extracted</p>" })
    );
  });
});
