import type { FastifyReply, FastifyRequest } from 'fastify'
import { crunchyLogin, checkIfLoggedInCR, safeLoginData, addEpisodeToPlaylist, getPlaylist, getDownloading, deletePlaylist } from './crunchyroll.service'
import { dialog } from 'electron'
import { messageBox } from '../../../electron/background'
import { CrunchyEpisodes, CrunchySeason } from '../../types/crunchyroll'

export async function loginController(request: FastifyRequest, reply: FastifyReply) {
  const account = await checkIfLoggedInCR('crunchyroll')

  if (!account) {
    return reply.code(401).send({ message: 'Not Logged in' })
  }

  const { data, error } = await crunchyLogin(account.username, account.password)

  if (error) {
    reply.code(400).send(error)
  }

  return reply.code(200).send(data)
}

export async function checkLoginController(request: FastifyRequest, reply: FastifyReply) {
  const account = await checkIfLoggedInCR('crunchyroll')

  if (!account) {
    return reply.code(401).send({ message: 'Not Logged in' })
  }

  return reply.code(200).send({ message: 'Logged in' })
}

export async function loginLoginController(
  request: FastifyRequest<{
    Body: {
      user: string
      password: string
    }
  }>,
  reply: FastifyReply
) {
  const body = request.body

  const account = await checkIfLoggedInCR('crunchyroll')

  if (account) {
    return reply.code(404).send({ message: 'Already Logged In' })
  }

  const { data, error } = await crunchyLogin(body.user, body.password)

  if (error || !data) {
    return reply.code(404).send({
      message: 'Invalid Email or Password'
    })
  }

  await safeLoginData(body.user, body.password, 'crunchyroll')

  return reply.code(200).send()
}

export async function addPlaylistController(
  request: FastifyRequest<{
    Body: {
      episodes: CrunchyEpisodes
      dubs: Array<string>
      subs: Array<string>
      dir: string,
      hardsub: boolean
    }
  }>,
  reply: FastifyReply
) {

  const body = request.body;

  for (const e of body.episodes) {
    await addEpisodeToPlaylist(e, body.subs, body.dubs, body.dir, body.hardsub, "waiting")
  }

  return reply.code(201).send()
}

export async function deleteCompletePlaylistController(
  request: FastifyRequest,
  reply: FastifyReply
) {

  await deletePlaylist()

  return reply.code(200).send()
}

export async function getPlaylistController(
  request: FastifyRequest,
  reply: FastifyReply
) {

  const playlist = await getPlaylist()

  for (const v of playlist) {
    if (v.dataValues.status === 'downloading') {
      const found = await getDownloading(v.dataValues.id)
      if (found) {
        (v as any).dataValues = {
          ...v.dataValues,
          partsleft: found.partsToDownload,
          partsdownloaded: found.downloadedParts,
          downloadspeed: found.downloadSpeed.toFixed(2)
        }
      }
    }
  }

  return reply.code(200).send(playlist.reverse())
}
