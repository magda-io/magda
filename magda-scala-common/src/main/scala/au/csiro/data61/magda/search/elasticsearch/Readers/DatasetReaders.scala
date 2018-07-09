package au.csiro.data61.magda.search.elasticsearch.Readers

import com.sksamuel.elastic4s.AggReader
import com.sksamuel.elastic4s.json.JacksonSupport
import au.csiro.data61.magda.model.misc.DataSet


object DatasetReaders{

  implicit object AggReader extends AggReader[DataSet]{

    def read(json:String) = {
      try{
        Right(JacksonSupport.mapper.readValue[DataSet](json))
      }catch {
        case e: Throwable => Left(e)
      }
    }

  }

}


