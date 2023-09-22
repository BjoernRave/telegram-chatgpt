import OpenAI from 'openai'

require('dotenv').config()

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
})

const functions = [
  {
    name: 'get_current_weather',
    description: 'Get the current weather in a given location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description:
            'The location to get the weather for, city and country, e.g. "London, UK"',
        },
      },
      required: ['location'],
    },
    function: async ({ location }: { location: string }) => {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${location}`
      ).then((res) => res.json())

      const { lat, lon } = response[0]

      const response2 = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode`
      )
      const data = await response2.json()

      //get current weather
      const currentWeather = data.hourly[0]

      return {
        temperature: '20',
      }

      console.log(data)
    },
  },
]

const handleFunctionCall = async (message: string) => {
  const res1 = await openAI.chat.completions.create({
    model: 'gpt-3.5-turbo-0613',
    functions,
    messages: [
      {
        content: message,
        role: 'user',
      },
    ],
  })

  if (res1.choices[0].finish_reason === 'function_call') {
    const selectedFn = functions.find(
      (f) => f.name === res1.choices[0].message.function_call.name
    )

    if (!selectedFn) {
      throw new Error('Function not found')
    }

    const result = await selectedFn.function(
      JSON.parse(res1.choices[0].message.function_call.arguments)
    )

    const res2 = await openAI.chat.completions.create({
      model: 'gpt-3.5-turbo-0613',
      messages: [
        {
          content: message,
          role: 'user',
        },
        {
          function_call: res1.choices[0].message.function_call,
          content: '',
          role: 'assistant',
        },
        {
          content: JSON.stringify(result),
          name: res1.choices[0].message.function_call.name,
          role: 'function',
        },
      ],
    })
    return res2
  }

  return res1
}

const main = async (message: string) => {
  const completion = await handleFunctionCall(message)

  console.log(completion)
  console.log(completion.choices[0].message)
}

const message = process.argv[2]
main(message)
