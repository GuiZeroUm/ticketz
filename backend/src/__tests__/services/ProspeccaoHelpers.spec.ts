import fs from "fs";
import os from "os";
import path from "path";
import Company from "../../models/Company";
import User from "../../models/User";
import {
  canUseProspeccao,
  isProspeccaoCompany,
  isProspeccaoConfigured,
  prospeccaoConfig,
  prospeccaoSlugs
} from "../../helpers/prospeccao";

type CompanyLike = Pick<Company, "slug">;
type UserLike = Pick<User, "profile" | "super">;

const company = (slug: string | null): CompanyLike =>
  ({ slug }) as unknown as CompanyLike;

const user = (profile: string, isSuper = false): UserLike =>
  ({ profile, super: isSuper }) as unknown as UserLike;

describe("helpers/prospeccao", () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  describe("isProspeccaoCompany", () => {
    it("libera o tenant padrão da ferramenta", () => {
      expect(isProspeccaoCompany(company("teste"))).toBe(true);
    });

    it("ignora caixa e espaços no slug", () => {
      expect(isProspeccaoCompany(company("  TESTE "))).toBe(true);
    });

    it("bloqueia qualquer outro tenant", () => {
      expect(isProspeccaoCompany(company("acnorte"))).toBe(false);
      expect(isProspeccaoCompany(company(null))).toBe(false);
      expect(isProspeccaoCompany(null)).toBe(false);
    });

    it("respeita a lista configurada por ambiente", () => {
      process.env.PROSPECCAO_SLUGS = "teste,parceiro";
      expect(isProspeccaoCompany(company("parceiro"))).toBe(true);
      expect(isProspeccaoCompany(company("outro"))).toBe(false);
    });

    it("não libera ninguém quando a lista configurada é vazia", () => {
      process.env.PROSPECCAO_SLUGS = " , ";
      expect(prospeccaoSlugs()).toEqual([]);
      expect(isProspeccaoCompany(company("teste"))).toBe(false);
    });
  });

  describe("canUseProspeccao", () => {
    it("aceita admin do tenant e super", () => {
      expect(canUseProspeccao(user("admin"))).toBe(true);
      expect(canUseProspeccao(user("user", true))).toBe(true);
    });

    it("recusa atendente comum", () => {
      expect(canUseProspeccao(user("user"))).toBe(false);
      expect(canUseProspeccao(null)).toBe(false);
    });
  });

  describe("prospeccaoConfig", () => {
    it("remove barra final das URLs configuradas", () => {
      process.env.PROSPECCAO_API_URL = "http://prospeccao.local:8000/";
      process.env.PROSPECCAO_BRIDGE_URL = "http://bridge.local:8001//";
      const config = prospeccaoConfig();
      expect(config.apiUrl).toBe("http://prospeccao.local:8000");
      expect(config.bridgeUrl).toBe("http://bridge.local:8001");
    });

    it("só se considera configurada quando existe chave", () => {
      delete process.env.PROSPECCAO_API_KEY;
      delete process.env.PROSPECCAO_API_KEY_FILE;
      expect(isProspeccaoConfigured()).toBe(false);
      process.env.PROSPECCAO_API_KEY = "chave-de-teste";
      expect(isProspeccaoConfigured()).toBe(true);
    });

    it("lê a chave do arquivo do secret quando não vem pelo ambiente", () => {
      const caminho = path.join(os.tmpdir(), `prospeccao-${Date.now()}.key`);
      // O docker secret costuma terminar em newline; a chave não pode levá-la
      // junto para o header.
      fs.writeFileSync(caminho, "chave-do-arquivo\n");
      delete process.env.PROSPECCAO_API_KEY;
      process.env.PROSPECCAO_API_KEY_FILE = caminho;

      expect(prospeccaoConfig().apiKey).toBe("chave-do-arquivo");

      fs.unlinkSync(caminho);
    });

    it("a variável direta tem prioridade sobre o arquivo", () => {
      process.env.PROSPECCAO_API_KEY = "chave-do-ambiente";
      process.env.PROSPECCAO_API_KEY_FILE = "/caminho/que/nao/existe";
      expect(prospeccaoConfig().apiKey).toBe("chave-do-ambiente");
    });

    it("não derruba o backend quando o arquivo do secret não existe", () => {
      delete process.env.PROSPECCAO_API_KEY;
      process.env.PROSPECCAO_API_KEY_FILE = "/caminho/que/nao/existe";
      expect(prospeccaoConfig().apiKey).toBe("");
      expect(isProspeccaoConfigured()).toBe(false);
    });
  });
});
