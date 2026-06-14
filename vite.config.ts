import react from "@vitejs/plugin-react-swc";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  return {
    define: {
      "process.env": {
        NODE_ENV: JSON.stringify(
          command === "build" ? "production" : "development"
        ),
      },
    },
    build: {
      lib: {
        entry: "src/main.ts",
        fileName: "index",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["react", "valtio"],
      },
    },
    plugins: [
      react({
        useAtYourOwnRisk_mutateSwcOptions(options) {
          options.jsc.transform = {
            ...options.jsc.transform,
            react: {
              ...options.jsc.transform?.react,
              runtime: "classic",
              pragma: "React.createElement",
              pragmaFrag: "React.Fragment",
            },
          };
        },
      }),
      externalGlobals({ react: "React", valtio: "Valtio" }),
    ],
  };
});
