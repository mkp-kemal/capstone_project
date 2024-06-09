import { Injectable, BadRequestException } from '@nestjs/common';
import * as tfjs from '@tensorflow/tfjs-node';
import { FishQuery } from 'prisma/queries/fish/fish.query';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PredictService {
    private storage: Storage;
    private bucketName: string;
    private folderName: string;
    constructor(private readonly fishQuery: FishQuery) {
        this.storage = new Storage({
            keyFilename: 'secret_key.json',
            projectId: 'aquaqulture-mate',
        });
        this.bucketName = 'aquaculture_mate-bucket';
        this.folderName = 'history-image';
    }

    async uploadFile(file: any): Promise<string> {
        const filename = uuidv4() + '-aquaqulture';
        const filePath = `${this.folderName}/${filename}`;
        const bucket = this.storage.bucket(this.bucketName);
        const blob = bucket.file(filePath);

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            }
        });

        return new Promise((resolve, reject) => {
            blobStream
                .on('finish', () => {
                    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${blob.name}`;
                    resolve(publicUrl);
                })
                .on('error', (err) => {
                    reject(`Unable to upload image, something went wrong: ${err.message}`);
                })
                .end(file.data);
        });
    }

    async predictClassification(model, image) {
        try {
            const tensor = tfjs.node.decodeJpeg(image.data)
                .resizeNearestNeighbor([224, 224])
                .expandDims()
                .toFloat()
                .div(tfjs.scalar(255));

            const prediction = model.predict(tensor);
            const scores = await prediction.data();

            const maxScoreIndex = scores.indexOf(Math.max(...scores));

            let jenis_ikan, pakan, pemeliharaan;
            const ikanLabels = ["Gabus", "Mas", "Lele", "Nila", "Patin"];

            if (maxScoreIndex >= 0 && maxScoreIndex < ikanLabels.length) {
                jenis_ikan = ikanLabels[maxScoreIndex];
                const ikanInfo = await this.fishQuery.getFishByName(jenis_ikan);
                pakan = ikanInfo.pakan;
                pemeliharaan = ikanInfo.pemeliharaan;
            } else {
                ({ jenis_ikan, pakan, pemeliharaan } = { jenis_ikan: "Tidak Diketahui", pakan: "Tidak Diketahui", pemeliharaan: "Tidak Diketahui" });
            }

            return { jenis_ikan, pakan, pemeliharaan };
        } catch (error) {
            throw new BadRequestException(`Terjadi kesalahan input: ${error.message}`);
        }
    }
}
