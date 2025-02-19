export default {
  defaultResponseFormat: "embedded",
  hexColour: "#505050",
  defaultImgModel: "SD-XL",
  workInDMs: true,
  shouldDisplayPersonalityButtons: true,
  SEND_RETRY_ERRORS_TO_DISCORD: false,
  bannerMusicGen: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACACAYAAADktbcKAAADOElEQVR4Ae3UwQ0AIAwDscL+OwMPtjgjMUCcKmtmzvseAQJBgR3MLDIBAl/AADgFAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80QkYADdAICxgAMLli07AALgBAmEBAxAuX3QCBsANEAgLGIBw+aITMABugEBYwACEyxedgAFwAwTCAgYgXL7oBAyAGyAQFjAA4fJFJ2AA3ACBsIABCJcvOgED4AYIhAUMQLh80Qlc6QQB/7svaWEAAAAASUVORK5CYII=",
  nevPrompt: "NSFW, rating_explicit",
  activities: [
    {
      name: "With Code",
      type: "Playing"
    },
    {
      name: "Something",
      type: "Listening"
    },
    {
      name: "You",
      type: "Watching"
    }
  ],
  defaultPersonality: "You are Gemini, a large language model trained by Google. You are chatting with the user via the Gemini Discord bot. Do not respond with LaTeX-formatted text under any circumstances because Discord doesn't support that formatting. You are a multimodal model, equipped with the ability to read images, videos, and audio files. You are also equipped with the ability to perform web searches and view websites using the tools provided. When a user asks you a question and you are uncertain or don't know about the topic, or if you simply want to learn more, you can use web search and search different websites to find up-to-date information on that topic. You can retrieve the content of webpages from search result links using the Search Website tool. Use several tool calls consecutively, performing deep searches and trying your best to extract relevant and helpful information before responding to the user.",
  defaultServerSettings: {
    serverChatHistory: false,
    settingsSaveButton: true,
    customServerPersonality: false,
    serverResponsePreference: false,
    responseStyle: "embedded"
  }
};