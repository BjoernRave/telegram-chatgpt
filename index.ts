import { Configuration, OpenAIApi } from 'openai'
import TelegramBot from 'node-telegram-bot-api'
import telegramifyMarkdown from 'telegramify-markdown'
import { PrismaClient } from '@prisma/client'

require('dotenv').config()

const prisma = new PrismaClient()

const makeCompletion = async () => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
  })
  const openai = new OpenAIApi(configuration)

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })

  bot.onText(/\/password/, async (msg) => {
    const providedPassword = msg.text.replace('/password ', '')

    if (process.env.TELEGRAM_PASSWORD !== providedPassword) {
      return
    }

    const user = await prisma.user.findUnique({
      where: {
        telegramId: String(msg.from.id),
      },
    })

    if (user) {
      bot.sendMessage(msg.chat.id, 'You are already registered')
      return
    }

    await prisma.user.create({
      data: {
        telegramId: String(msg.from.id),
      },
    })

    bot.sendMessage(msg.chat.id, 'You are now registered')
  })

  bot.onText(/\/clear/, async (msg) => {
    await prisma.message.updateMany({
      where: {
        isActive: true,
      },
      data: {
        isActive: false,
      },
    })

    bot.sendMessage(msg.chat.id, 'Cleared all messages')
  })

  bot.on('message', async (msg) => {
    if (['/clear', '/password'].includes(msg.text)) return

    const user = await prisma.user.findUnique({
      where: {
        telegramId: String(msg.from.id),
      },
    })

    if (!user) {
      return
    }

    var dt = new Date()

    const dateString =
      dt.getFullYear() + '/' + (dt.getMonth() + 1) + '/' + dt.getDate()

    const previousMessages = await prisma.message.findMany({
      where: {
        isActive: true,
      },
    })

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          content: `You are ChatGPT, a large language model trained to assist me. Answer as concisely and helpful as possible. Current date: ${dateString}`,
          role: 'system',
        },
        ...previousMessages.map((message) => ({
          content: message.text,
          role: message.role as any,
        })),
        {
          content: msg.text,
          role: 'user',
        },
      ],
    })

    bot.sendMessage(
      msg.chat.id,
      telegramifyMarkdown(completion.data.choices[0].message.content),
      { parse_mode: 'MarkdownV2' }
    )

    const userMessagePromise = prisma.message.create({
      data: {
        text: msg.text,
        role: 'user',
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    })

    const botMessagePromise = prisma.message.create({
      data: {
        text: completion.data.choices[0].message.content,
        role: 'assistant',
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    })

    await Promise.all([userMessagePromise, botMessagePromise])
  })
}

makeCompletion()
