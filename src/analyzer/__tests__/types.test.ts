import { describe, it, expect } from "vitest";
import { AnalysisError } from "../types.js";
import type {
  ProjectAnalysis,
  AnalysisModule,
  AnalysisWorkflow,
  DataflowEdge,
  ConfigKey,
} from "../types.js";

describe("analyzer types", () => {
  describe("AnalysisError", () => {
    it("is an instance of Error", () => {
      const err = new AnalysisError("test", "no_entry_point");
      expect(err).toBeInstanceOf(Error);
    });

    it("has name set to AnalysisError", () => {
      const err = new AnalysisError("something failed", "empty_sample");
      expect(err.name).toBe("AnalysisError");
    });

    it("stores message correctly", () => {
      const err = new AnalysisError(
        "Could not find entry point",
        "no_entry_point",
      );
      expect(err.message).toBe("Could not find entry point");
    });

    it("stores type for no_entry_point", () => {
      const err = new AnalysisError("msg", "no_entry_point");
      expect(err.type).toBe("no_entry_point");
    });

    it("stores type for empty_sample", () => {
      const err = new AnalysisError("msg", "empty_sample");
      expect(err.type).toBe("empty_sample");
    });

    it("stores type for llm_parse_failure", () => {
      const err = new AnalysisError("msg", "llm_parse_failure");
      expect(err.type).toBe("llm_parse_failure");
    });

    it("stores type for repomix_failure", () => {
      const err = new AnalysisError("msg", "repomix_failure");
      expect(err.type).toBe("repomix_failure");
    });

    it("stores optional details when provided", () => {
      const err = new AnalysisError(
        "parse failed",
        "llm_parse_failure",
        "unexpected token at position 42",
      );
      expect(err.details).toBe("unexpected token at position 42");
    });

    it("has undefined details when not provided", () => {
      const err = new AnalysisError("msg", "no_entry_point");
      expect(err.details).toBeUndefined();
    });
  });

  describe("ProjectAnalysis", () => {
    it("accepts a fully populated analysis object", () => {
      const analysis: ProjectAnalysis = {
        purpose: "CLI tool for compiling agent environments",
        domain: "developer-tools",
        key_modules: [
          {
            name: "compiler",
            path: "src/compiler/",
            description: "Compiles intent into environment specs",
            responsibilities: ["orchestration", "LLM calls"],
          },
        ],
        workflows: [
          {
            name: "compile",
            description: "Compile an environment from intent",
            trigger: "kairn compile",
            steps: ["parse intent", "select tools", "generate harness"],
          },
        ],
        architecture_style: "modular CLI",
        deployment_model: "npm package",
        dataflow: [
          { from: "cli", to: "compiler", data: "user intent" },
        ],
        config_keys: [
          { name: "api_key", purpose: "Anthropic API authentication" },
        ],
        sampled_files: ["src/cli.ts", "src/compiler/compile.ts"],
        content_hash: "abc123",
        analyzed_at: "2026-04-03T00:00:00Z",
      };

      expect(analysis.purpose).toBe(
        "CLI tool for compiling agent environments",
      );
      expect(analysis.key_modules).toHaveLength(1);
      expect(analysis.workflows).toHaveLength(1);
      expect(analysis.dataflow).toHaveLength(1);
      expect(analysis.config_keys).toHaveLength(1);
      expect(analysis.sampled_files).toHaveLength(2);
    });
  });

  describe("AnalysisModule", () => {
    it("has all required fields", () => {
      const mod: AnalysisModule = {
        name: "adapter",
        path: "src/adapter/",
        description: "Adapts specs to runtime targets",
        responsibilities: ["file generation", "path resolution"],
      };

      expect(mod.name).toBe("adapter");
      expect(mod.responsibilities).toHaveLength(2);
    });
  });

  describe("AnalysisWorkflow", () => {
    it("has all required fields", () => {
      const wf: AnalysisWorkflow = {
        name: "init",
        description: "Initialize a new project",
        trigger: "kairn init",
        steps: ["detect runtime", "prompt user", "write files"],
      };

      expect(wf.trigger).toBe("kairn init");
      expect(wf.steps).toHaveLength(3);
    });
  });

  describe("DataflowEdge", () => {
    it("has from, to, and data fields", () => {
      const edge: DataflowEdge = {
        from: "compiler",
        to: "adapter",
        data: "EnvironmentSpec",
      };

      expect(edge.from).toBe("compiler");
      expect(edge.to).toBe("adapter");
      expect(edge.data).toBe("EnvironmentSpec");
    });
  });

  describe("ConfigKey", () => {
    it("has name and purpose fields", () => {
      const key: ConfigKey = {
        name: "model",
        purpose: "Default LLM model for compilation",
      };

      expect(key.name).toBe("model");
      expect(key.purpose).toBe("Default LLM model for compilation");
    });
  });
});
