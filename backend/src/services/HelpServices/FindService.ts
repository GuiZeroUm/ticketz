import FindPublicService, {
  PublicHelpGroup
} from "../HelpGroupServices/FindPublicService";

/**
 * Grade de cards da tela /helps do tenant: material da plataforma mais o da
 * propria empresa.
 */
const FindService = async (companyId: number): Promise<PublicHelpGroup[]> => {
  return FindPublicService("company", companyId);
};

export default FindService;
