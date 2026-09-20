import "dotenv/config";
import {createApp} from "./app.js";
const app=await createApp();
const port=process.env.PORT || 8787;
const host=process.env.HOST || "127.0.0.1";
app.listen(port,host,()=>console.log("Portfolio serving on http://"+host+":"+port));
