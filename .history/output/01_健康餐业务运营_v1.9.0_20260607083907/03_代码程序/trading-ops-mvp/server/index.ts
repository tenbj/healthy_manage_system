import dotenv from 'dotenv'
import { createApp } from './app.ts'

dotenv.config({ path: '.env.local' })
dotenv.config()

const port = Number(process.env.PORT ?? 4310)
const app = createApp()

app.listen(port, () => {
  console.log(`Trading ops API listening on http://127.0.0.1:${port}`)
})
