import { Configuration, OpenAIApi } from 'openai'
import TelegramBot from 'node-telegram-bot-api'
import telegramifyMarkdown from 'telegramify-markdown'
import { PrismaClient } from '@prisma/client'

require('dotenv').config()

const prisma = new PrismaClient()

const escapeSpecialChars = (str: string) => {
  const specialChars = '_*[]()~`>#-={}+|.!'
  let escapedStr = ''

  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i)
    if (specialChars.includes(char)) {
      escapedStr += '\\' + char
    } else {
      escapedStr += char
    }
  }

  return escapedStr
}

const makeCompletion = async () => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
  })
  const openai = new OpenAIApi(configuration)

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })

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
    if (msg.text === '/clear') return

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
      escapeSpecialChars(
        telegramifyMarkdown(completion.data.choices[0].message.content)
      ),
      { parse_mode: 'MarkdownV2' }
    )

    const userMessagePromise = prisma.message.create({
      data: {
        text: msg.text,
        role: 'user',
      },
    })

    const botMessagePromise = prisma.message.create({
      data: {
        text: completion.data.choices[0].message.content,
        role: 'assistant',
      },
    })

    await Promise.all([userMessagePromise, botMessagePromise])
  })
}

makeCompletion()
