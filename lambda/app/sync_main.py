# Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
import logging
import os
from datetime import datetime
import boto3
import textractcaller as tc

from botocore.config import Config
import botocore.exceptions

logger = logging.getLogger(__name__)
__version__ = "0.0.1"
s3 = boto3.client('s3')

config = Config(retries={'max_attempts': 0, 'mode': 'standard'})
textract = boto3.client("textract", config=config)


def lambda_handler(event, _):
    log_level = os.environ.get('LOG_LEVEL', 'INFO')
    s3_output_bucket = os.environ.get('S3_OUTPUT_BUCKET', "")
    s3_output_prefix = os.environ.get('S3_OUTPUT_PREFIX', "")
    if not (s3_output_bucket and s3_output_prefix):
        raise ValueError("not output bucket or output prefix")
    logger.setLevel(log_level)

    logger.info(json.dumps(event))

    for record in event['Records']:
        s3_bucket = record['s3']['bucket']['name']
        s3_key = record['s3']['object']['key']
        s3_path = f"s3://{s3_bucket}/{s3_key}"
        s3_filename, _ = os.path.splitext(os.path.basename(s3_path))

        try:
            textract_response = tc.call_textract(
                    input_document=s3_path,
                    call_mode=tc.Textract_Call_Mode.FORCE_SYNC)
            logger.info(len(textract_response))
            output_bucket_key = s3_output_prefix + "/" + datetime.utcnow().isoformat() + "/" + s3_filename + ".json"
            s3.put_object(Body=bytes(
                json.dumps(textract_response, indent=4).encode('UTF-8')),
                        Bucket=s3_output_bucket,
                        Key=output_bucket_key)
            logger.info("after object stored")
        except Exception as e:
            logger.error(e)

    return {}
