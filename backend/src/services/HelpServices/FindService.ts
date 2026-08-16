import FindPublicService, {
  PublicHelpGroup
} from "../HelpGroupServices/FindPublicService";

/**
 * Grade de cards da tela /helps do tenant.
 */
const FindService = async (): Promise<PublicHelpGroup[]> => {
  return FindPublicService("company");
};

export default FindService;
