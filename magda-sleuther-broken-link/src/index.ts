import sleuther from "./sleuther";

sleuther().catch(e => {
  console.error("Error: " + e.message, e);
});
