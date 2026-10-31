import Contact from "../../../models/Contact";
import validateGroupAccessIds from "../ValidateGroupAccessIds";

jest.mock("../../../models/Contact");

const countGroups = Contact.count as jest.MockedFunction<typeof Contact.count>;

it("keeps legacy queue access when no selection is configured", async () => {
  await expect(validateGroupAccessIds(null, 7)).resolves.toBeNull();
  expect(countGroups).not.toHaveBeenCalled();
});

it("validates every selected group inside the user's company", async () => {
  countGroups.mockResolvedValue(2);
  await expect(validateGroupAccessIds([31, 32, 31], 7)).resolves.toEqual([
    31,
    32
  ]);
  expect(countGroups).toHaveBeenCalledWith({
    where: expect.objectContaining({
      companyId: 7,
      isGroup: true,
      groupMode: "conversation"
    })
  });
});

it("rejects a group from another company", async () => {
  countGroups.mockResolvedValue(0);
  await expect(validateGroupAccessIds([31], 7)).rejects.toMatchObject({
    message: "ERR_INVALID_GROUP_ACCESS",
    statusCode: 400
  });
});
